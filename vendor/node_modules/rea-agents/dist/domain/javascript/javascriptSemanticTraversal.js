import * as t from "@babel/types";
/**
 * Visit every Babel AST node in deterministic source-tree order.
 *
 * `readAncestors` returns a snapshot during `enter`, outermost-first and
 * ending with the direct parent. Callers
 * need it whenever meaning depends on where a node sits, not just what its
 * immediate parent is — a binding inside `catch ({message})` or `({a} = o)`
 * has an ObjectProperty parent, so the parent alone cannot say whether the
 * identifier declares a binding or is assigned to.
 */
export const traverseJavaScriptAst = (root, visitor) => {
    const ancestors = [];
    const enter = (node, parent) => {
        visitor.enter(node, parent, () => [...ancestors]);
        ancestors.push(node);
        return { node, parent, children: childNodes(node), nextIndex: 0 };
    };
    const pending = [enter(root, null)];
    while (pending.length > 0) {
        const current = pending.at(-1);
        if (current === undefined)
            break;
        const child = current.children[current.nextIndex];
        if (child !== undefined) {
            current.nextIndex += 1;
            pending.push(enter(child, current.node));
        }
        else {
            visitor.exit?.(current.node, current.parent);
            ancestors.pop();
            pending.pop();
        }
    }
};
const childNodes = (node) => {
    const keys = t.VISITOR_KEYS[node.type];
    if (keys === undefined)
        return [];
    const children = [];
    for (const key of keys) {
        const value = Reflect.get(node, key);
        if (t.isNode(value)) {
            children.push(value);
            continue;
        }
        if (!Array.isArray(value))
            continue;
        for (const item of value) {
            if (t.isNode(item))
                children.push(item);
        }
    }
    return children;
};
