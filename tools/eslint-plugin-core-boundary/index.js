/**
 * eslint-plugin-core-boundary
 *
 * The architecture rule from QUALITY-BAR section 1 and STACK section 2, made
 * enforceable. Nothing under a `core/` directory may:
 *
 *   1. import `render/`, `ui/` or the shared engine's renderer;
 *   2. touch a DOM, BOM or canvas global, in a value or a type position;
 *   3. call `Math.random()`.
 *
 * Graded as item M3, severity Critical, on both games.
 *
 * Two design decisions worth keeping.
 *
 * **The rules decide for themselves whether a file is inside the boundary**, by
 * looking for a `core` path segment, rather than trusting a `files:` glob in the
 * flat config. A glob is one edit away from silently unscoping the whole gate,
 * and a gate that stops applying is indistinguishable from a gate that passes.
 * The config still narrows the glob; the rule does not depend on it.
 *
 * **Globals are found by scope analysis, not by text.** A reference is reported
 * only when it resolves to nothing, or to a global with no definition in the
 * program. A core module that declares or imports its own `Event`, `Node` or
 * `Image` type is left alone, which a grep could never manage.
 */

import { isBannedGlobal } from './banned-globals.js';

const DOCS_ROOT = 'tools/eslint-plugin-core-boundary/README.md';

function docs(name) {
  return DOCS_ROOT + '#' + name;
}

/** Path segments, normalised across Windows and POSIX separators. */
function segments(filename) {
  return String(filename).replace(/\\/g, '/').split('/');
}

/**
 * True when this file sits inside the boundary directory.
 *
 * Compared case-insensitively. Windows and macOS filesystems are case
 * insensitive, so `src/Core/shoe.ts` is the same directory as `src/core/`
 * to every tool that opens it, and a case-sensitive comparison here would
 * hand anyone who typed the capital an unguarded core module.
 */
function insideBoundary(filename, boundaryDir) {
  const wanted = boundaryDir.toLowerCase();
  return segments(filename).some((segment) => segment.toLowerCase() === wanted);
}

/**
 * The string value of a module specifier node, or null if it is not statically
 * known.
 *
 * Template literals are included, and that is not a nicety. Every bundler
 * resolves `import(`../ui/panel`)` statically and emits the chunk, so a
 * specifier check that only reads `Literal` nodes lets a real cross-boundary
 * import through while looking like it checked.
 */
function specifierOf(node) {
  if (!node) {
    return null;
  }
  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : null;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    const quasi = node.quasis[0];
    return quasi ? quasi.value.cooked : null;
  }
  if (node.type === 'TSLiteralType') {
    return specifierOf(node.literal);
  }
  return null;
}

function optionsOf(context) {
  const given = context.options[0] ?? {};
  return {
    boundaryDir: given.boundaryDir ?? 'core',
    allow: new Set(given.allow ?? []),
  };
}

/** True when some enclosing scope declares `name` with a real definition. */
function declaredInScopeChain(scope, name) {
  for (let s = scope; s !== null && s !== undefined; s = s.upper) {
    const variable = s.set.get(name);
    if (variable && variable.defs.length > 0) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. Forbidden imports
// ---------------------------------------------------------------------------

// A path segment that is exactly `render` or `ui`. `../render/felt` matches,
// `../render-cache` does not, and neither does `./guide`.
const RENDER_SEGMENT = /(?:^|[/@])render(?:\/|$)/;
const UI_SEGMENT = /(?:^|[/@])ui(?:\/|$)/;
const ENGINE_RENDERER = /^@js-games\/engine\/render(?:\/|$)/;

function classify(source) {
  if (ENGINE_RENDERER.test(source)) {
    return 'engineRenderer';
  }
  if (RENDER_SEGMENT.test(source)) {
    return 'renderLayer';
  }
  if (UI_SEGMENT.test(source)) {
    return 'uiLayer';
  }
  return null;
}

const OPTION_SCHEMA = [
  {
    type: 'object',
    properties: {
      boundaryDir: { type: 'string' },
      allow: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
];

const noForbiddenImports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid imports of render/, ui/ or the shared engine renderer from inside core/.',
      url: docs('no-forbidden-imports'),
    },
    schema: OPTION_SCHEMA,
    messages: {
      renderLayer:
        'core/ may not import the render layer: {{source}}. Move the shared value into core/, or pass it in.',
      uiLayer:
        'core/ may not import the ui layer: {{source}}. Chrome is DOM and it depends on core, never the reverse.',
      engineRenderer:
        'core/ may not import the shared engine renderer: {{source}}.',
    },
  },

  create(context) {
    const { boundaryDir, allow } = optionsOf(context);
    if (!insideBoundary(context.filename, boundaryDir)) {
      return {};
    }

    function check(node) {
      const raw = specifierOf(node);
      if (raw === null || raw === undefined || allow.has(raw)) {
        return;
      }
      const messageId = classify(raw);
      if (messageId !== null) {
        context.report({ node, messageId, data: { source: raw } });
      }
    }

    function fromSource(node) {
      if (node.source) {
        check(node.source);
      }
    }

    return {
      ImportDeclaration: fromSource,
      ExportNamedDeclaration: fromSource,
      ExportAllDeclaration: fromSource,
      ImportExpression: fromSource,

      // `type X = import('../render/felt').Felt`. The property holding the
      // specifier has been called `source`, `argument` and `parameter` across
      // parser versions, and it is sometimes wrapped in a TSLiteralType, so
      // unwrap all of them rather than pinning the gate to one parser release.
      TSImportType(node) {
        check(node.source ?? node.argument ?? node.parameter);
      },

      TSExternalModuleReference(node) {
        check(node.expression);
      },

      CallExpression(node) {
        const callee = node.callee;
        const isRequire =
          callee.type === 'Identifier' && callee.name === 'require';
        if (isRequire) {
          check(node.arguments[0]);
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2. No DOM, BOM or canvas
// ---------------------------------------------------------------------------

/**
 * A reference points at a platform global when it resolves to nothing, or to a
 * global-scope variable that no line of this program defines. Anything the
 * module declares or imports resolves to a definition and is not our business.
 */
function isGlobalReference(reference) {
  const resolved = reference.resolved;
  if (!resolved) {
    return true;
  }
  return resolved.scope.type === 'global' && resolved.defs.length === 0;
}

function walkScopes(scope, visit) {
  visit(scope);
  for (const child of scope.childScopes) {
    walkScopes(child, visit);
  }
}

const noDom = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid DOM, BOM and canvas globals inside core/, in value and type positions alike.',
      url: docs('no-dom'),
    },
    schema: OPTION_SCHEMA,
    messages: {
      banned:
        'core/ may not touch the DOM or canvas: {{name}} is a platform global. Keep it in render/ or ui/ and pass core a plain value.',
      viaGlobalThis:
        'core/ may not touch the DOM or canvas: globalThis.{{name}} reaches the same platform global.',
      globalReach:
        'core/ may not reference {{name}}. It reaches every platform global, including by a computed name the lint cannot read, so it is refused outright rather than by property.',
      domLib:
        'core/ may not pull in the DOM type library with a triple-slash reference.',
    },
  },

  create(context) {
    const { boundaryDir, allow } = optionsOf(context);
    if (!insideBoundary(context.filename, boundaryDir)) {
      return {};
    }
    const sourceCode = context.sourceCode;
    const reported = new Set();

    // Ranges of `globalThis` / `self` identifiers already reported through a
    // named property access, so the outright ban below does not double up on
    // the same line with a less useful message.
    const consumed = new Set();

    function report(node, messageId, name) {
      const key = node.range[0] + ':' + node.range[1] + ':' + messageId;
      if (reported.has(key)) {
        return;
      }
      reported.add(key);
      context.report({ node, messageId, data: { name } });
    }

    function banned(name) {
      return !allow.has(name) && isBannedGlobal(name);
    }

    function propertyName(node) {
      const property = node.property;
      if (!node.computed && property.type === 'Identifier') {
        return property.name;
      }
      if (property.type === 'Literal' && typeof property.value === 'string') {
        return property.value;
      }
      return null;
    }

    return {
      // globalThis.document and self.document sidestep a bare reference.
      MemberExpression(node) {
        const object = node.object;
        const reachesGlobal =
          object.type === 'Identifier' &&
          (object.name === 'globalThis' || object.name === 'self') &&
          !declaredInScopeChain(sourceCode.getScope(node), object.name);
        if (!reachesGlobal) {
          return;
        }
        const name = propertyName(node);
        if (name !== null && banned(name)) {
          consumed.add(object.range[0]);
          report(node, 'viaGlobalThis', name);
        }
      },

      // Type positions. typescript-eslint does create references for these, but
      // relying on that alone would make the gate depend on a parser detail.
      TSTypeReference(node) {
        let name = node.typeName;
        while (name && name.type === 'TSQualifiedName') {
          name = name.left;
        }
        if (!name || name.type !== 'Identifier') {
          return;
        }
        if (
          banned(name.name) &&
          !declaredInScopeChain(sourceCode.getScope(node), name.name)
        ) {
          report(name, 'banned', name.name);
        }
      },

      'Program:exit'(node) {
        for (const comment of sourceCode.getAllComments()) {
          if (/<reference\s+lib\s*=\s*["'](dom|dom\.iterable)["']/i.test(comment.value)) {
            report(comment, 'domLib', 'dom');
          }
        }
        const manager = sourceCode.scopeManager;
        const root = manager.globalScope ?? sourceCode.getScope(node);
        walkScopes(root, (scope) => {
          for (const reference of scope.references) {
            const id = reference.identifier;
            if (!isGlobalReference(reference)) {
              continue;
            }
            // globalThis and self are refused outright rather than by
            // property. globalThis['doc' + 'ument'] and
            // Reflect.get(globalThis, 'document') both reach the DOM without
            // ever naming it, so no property-level check can see them. There
            // is no legitimate use for either inside core/.
            if (
              (id.name === 'globalThis' || id.name === 'self') &&
              !allow.has(id.name)
            ) {
              if (!consumed.has(id.range[0])) {
                report(id, 'globalReach', id.name);
              }
              continue;
            }
            if (banned(id.name)) {
              report(id, 'banned', id.name);
            }
          }
        });
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 3. No Math.random()
// ---------------------------------------------------------------------------

const noMathRandom = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid Math.random() inside core/. All randomness comes from the seeded rng module.',
      url: docs('no-math-random'),
    },
    schema: [
      {
        type: 'object',
        properties: { boundaryDir: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      mathRandom:
        'core/ may not call Math.random(). Take a stream from the seeded rng module through split(), so that changing one consumer cannot shift another.',
      mathAliased:
        'core/ may not capture Math itself, because an alias puts Math.random one step out of reach of this rule. Call the member you want directly, as Math.floor(x).',
    },
  },

  create(context) {
    const { boundaryDir } = optionsOf(context);
    if (!insideBoundary(context.filename, boundaryDir)) {
      return {};
    }
    const sourceCode = context.sourceCode;

    function isGlobalMath(node) {
      return (
        node.type === 'Identifier' &&
        node.name === 'Math' &&
        !declaredInScopeChain(sourceCode.getScope(node), 'Math')
      );
    }

    function keyName(node) {
      const key = node.type === 'Property' ? node.key : null;
      if (key === null) {
        return null;
      }
      if (key.type === 'Identifier') {
        return key.name;
      }
      return key.type === 'Literal' ? key.value : null;
    }

    /** The statically known member name in `Math.x`, or null. */
    function memberName(node) {
      const property = node.property;
      if (!node.computed && property.type === 'Identifier') {
        return property.name;
      }
      if (property.type === 'Literal' && typeof property.value === 'string') {
        return property.value;
      }
      return null;
    }

    /**
     * True when this reference to the global `Math` is one of the two shapes
     * that cannot hide `random`: a direct member access naming something else,
     * or a destructuring whose keys are all statically known. Everything else,
     * including `const m = Math` and `f(Math)`, puts `Math.random` one hop away
     * from a rule that only looks one hop, so it is refused.
     */
    function isSafeMathUse(id) {
      const parent = id.parent;
      if (parent === null || parent === undefined) {
        return false;
      }
      if (parent.type === 'MemberExpression' && parent.object === id) {
        // A statically known member is either harmless or already reported as
        // mathRandom by the visitor above. Only a computed member the lint
        // cannot read gets here, and that one could be `random`.
        return memberName(parent) !== null;
      }
      if (parent.type === 'VariableDeclarator' && parent.init === id) {
        if (parent.id.type !== 'ObjectPattern') {
          return false;
        }
        // `const { floor, max } = Math` is fine, and `const { random } = Math`
        // is already reported as mathRandom by the visitor above, so neither
        // belongs here. Only a computed key the lint cannot read is an alias,
        // because that key could be `random`.
        return parent.id.properties.every((property) => keyName(property) !== null);
      }
      return false;
    }

    return {
      // Math.random and Math['random'].
      MemberExpression(node) {
        if (!isGlobalMath(node.object)) {
          return;
        }
        if (memberName(node) === 'random') {
          context.report({ node, messageId: 'mathRandom' });
        }
      },

      // const { random } = Math;
      VariableDeclarator(node) {
        if (
          node.id.type !== 'ObjectPattern' ||
          node.init === null ||
          node.init === undefined ||
          !isGlobalMath(node.init)
        ) {
          return;
        }
        for (const property of node.id.properties) {
          if (keyName(property) === 'random') {
            context.report({ node: property, messageId: 'mathRandom' });
          }
        }
      },

      // Any other capture of Math itself: const m = Math, f(Math), Math[k].
      'Program:exit'(node) {
        const manager = sourceCode.scopeManager;
        const root = manager.globalScope ?? sourceCode.getScope(node);
        walkScopes(root, (scope) => {
          for (const reference of scope.references) {
            const id = reference.identifier;
            if (id.name !== 'Math' || !isGlobalReference(reference)) {
              continue;
            }
            if (!isSafeMathUse(id)) {
              context.report({ node: id, messageId: 'mathAliased' });
            }
          }
        });
      },
    };
  },
};

const plugin = {
  meta: {
    name: 'eslint-plugin-core-boundary',
    version: '1.0.0',
  },
  rules: {
    'no-forbidden-imports': noForbiddenImports,
    'no-dom': noDom,
    'no-math-random': noMathRandom,
  },
};

export default plugin;
export const rules = plugin.rules;

// Exported for tests/unit/core-boundary.test.ts. The case-insensitive match is
// the kind of property that is cheap to assert directly and awkward to assert
// through a fixture, because the filesystems this runs on will not keep
// `src/core` and `src/Core` apart long enough to write one.
export { insideBoundary, specifierOf };
