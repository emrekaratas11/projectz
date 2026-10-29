// ─── Zero-Dependency DOM-Diffing Virtual DOM & Granular Hook Engine ──────
// Preserves DOM node identity across renders (never calls container.innerHTML = ''),
// preventing CSS keyframe animations (.screen, .stagger, .legal-modal) from re-triggering
// and preventing input focus/caret loss or image flickering on state updates.

const NativeReact = (() => {
  let currentComponent = null;
  let hookIndex = 0;
  let rootInstance = null;

  function h(type, props, ...children) {
    const flatChildren = [];
    const flatten = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (Array.isArray(c)) {
          flatten(c);
        } else if (c !== null && c !== undefined && c !== false && c !== true) {
          flatChildren.push(typeof c === 'number' ? String(c) : c);
        }
      }
    };
    flatten(children);
    return { type, props: props || {}, children: flatChildren };
  }

  function useState(initialValue) {
    const comp = currentComponent;
    const idx = hookIndex++;
    if (comp.hooks.length <= idx) {
      comp.hooks[idx] = typeof initialValue === 'function' ? initialValue() : initialValue;
    }
    const setState = (next) => {
      const val = typeof next === 'function' ? next(comp.hooks[idx]) : next;
      if (!Object.is(val, comp.hooks[idx])) {
        comp.hooks[idx] = val;
        scheduleRender();
      }
    };
    return [comp.hooks[idx], setState];
  }

  function useEffect(effect, deps) {
    const comp = currentComponent;
    const idx = hookIndex++;
    const prev = comp.hooks[idx];
    let changed = true;
    if (prev && deps && prev.deps) {
      changed = deps.length !== prev.deps.length || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    }
    if (changed) {
      const prevCleanup = prev && prev.cleanup;
      const hookRecord = { deps, cleanup: prevCleanup };
      comp.hooks[idx] = hookRecord;
      queueMicrotask(() => {
        if (typeof hookRecord.cleanup === 'function') {
          try { hookRecord.cleanup(); } catch (e) {}
        }
        const nextCleanup = effect();
        hookRecord.cleanup = nextCleanup;
      });
    }
  }

  function useRef(initial) {
    const comp = currentComponent;
    const idx = hookIndex++;
    if (comp.hooks.length <= idx) {
      comp.hooks[idx] = { current: initial };
    }
    return comp.hooks[idx];
  }

  function useMemo(fn, deps) {
    const comp = currentComponent;
    const idx = hookIndex++;
    const prev = comp.hooks[idx];
    if (prev && deps && prev.deps && deps.length === prev.deps.length && !deps.some((d, i) => !Object.is(d, prev.deps[i]))) {
      return prev.value;
    }
    const value = fn();
    comp.hooks[idx] = { value, deps };
    return value;
  }

  function useCallback(fn, deps) {
    return useMemo(() => fn, deps);
  }

  const compMap = new Map();

  // Expand function components into concrete element/text vnodes
  function resolveVNode(vnode, path) {
    if (vnode === null || vnode === undefined || typeof vnode === 'boolean') {
      return null;
    }
    if (typeof vnode === 'string' || typeof vnode === 'number') {
      return { type: '#text', text: String(vnode), path };
    }
    if (typeof vnode.type === 'function') {
      const compName = vnode.type.name || 'Anon';
      const itemKey = vnode.props && vnode.props.key != null ? `:${vnode.props.key}` : '';
      const key = `${path}/${compName}${itemKey}`;
      let inst = compMap.get(key);
      if (!inst) {
        inst = { hooks: [] };
        compMap.set(key, inst);
      }
      const prevComp = currentComponent;
      const prevIdx = hookIndex;
      currentComponent = inst;
      hookIndex = 0;
      const rendered = vnode.type(Object.assign({}, vnode.props, { children: vnode.children }));
      currentComponent = prevComp;
      hookIndex = prevIdx;
      return resolveVNode(rendered, key);
    }
    return {
      type: vnode.type,
      props: vnode.props || {},
      children: (vnode.children || []).map((c, i) => {
        const cKey = c && c.props && c.props.key != null ? `k_${c.props.key}` : i;
        return resolveVNode(c, `${path}.${cKey}`);
      }),
      path
    };
  }

  // Update DOM properties & event listeners in-place without recreating the element
  function applyProps(dom, oldProps, newProps, tagType) {
    const listeners = dom.__listeners || (dom.__listeners = {});

    // Remove old props that are no longer present
    for (const k in oldProps) {
      if (k === 'key' || k === 'children') continue;
      if (!(k in newProps) || newProps[k] === null || newProps[k] === undefined) {
        if (k === 'className') {
          dom.className = '';
        } else if (k === 'style') {
          dom.removeAttribute('style');
        } else if (k.startsWith('on')) {
          const evt = mapEventName(k, tagType, oldProps);
          if (listeners[evt]) {
            dom.removeEventListener(evt, listeners[evt]);
            delete listeners[evt];
          }
        } else if (k in dom && (k === 'checked' || k === 'disabled' || k === 'required' || k === 'multiple')) {
          dom[k] = false;
        } else {
          dom.removeAttribute(k);
        }
      }
    }

    // Set or update new props
    for (const k in newProps) {
      if (k === 'key' || k === 'children') continue;
      const val = newProps[k];
      const oldVal = oldProps[k];
      if (val === undefined || val === null) continue;

      if (k === 'ref') {
        if (typeof val === 'function') val(dom);
        else if (typeof val === 'object') val.current = dom;
        continue;
      }

      if (k === 'className') {
        if (dom.className !== val) dom.className = val;
      } else if (k === 'style') {
        if (typeof val === 'object') {
          if (typeof oldVal === 'object' && oldVal) {
            for (const sk in oldVal) {
              if (!(sk in val)) dom.style[sk] = '';
            }
          } else {
            dom.removeAttribute('style');
          }
          for (const sk in val) {
            if (dom.style[sk] !== val[sk]) dom.style[sk] = val[sk];
          }
        }
      } else if (k.startsWith('on') && typeof val === 'function') {
        const evt = mapEventName(k, tagType, newProps);
        if (!listeners[evt]) {
          const proxy = (e) => {
            if (listeners[evt] && typeof listeners[evt].fn === 'function') {
              listeners[evt].fn(e);
            }
          };
          proxy.fn = val;
          listeners[evt] = proxy;
          dom.addEventListener(evt, proxy);
        } else {
          listeners[evt].fn = val;
        }
      } else if (k === 'value') {
        const strVal = String(val);
        if (dom.value !== strVal) {
          dom.value = strVal;
        }
      } else if (k === 'defaultValue') {
        if (!dom.__defaultValSet) {
          dom.value = String(val);
          dom.__defaultValSet = true;
        }
      } else if (k === 'checked') {
        const boolVal = Boolean(val);
        if (dom.checked !== boolVal) dom.checked = boolVal;
      } else if (k === 'defaultChecked') {
        if (!dom.__defaultCheckedSet) {
          dom.checked = Boolean(val);
          dom.__defaultCheckedSet = true;
        }
      } else if (k === 'disabled' || k === 'required' || k === 'multiple') {
        const boolVal = Boolean(val);
        if (dom[k] !== boolVal) dom[k] = boolVal;
      } else if (k === 'autoFocus') {
        if (val && !dom.__autoFocused) {
          dom.__autoFocused = true;
          queueMicrotask(() => { try { dom.focus(); } catch (e) {} });
        }
      } else if (oldVal !== val) {
        dom.setAttribute(k, val);
      }
    }
  }

  function mapEventName(propName, tagType, props) {
    const raw = propName.slice(2).toLowerCase();
    if (
      raw === 'change' &&
      (tagType === 'input' || tagType === 'textarea') &&
      props.type !== 'checkbox' &&
      props.type !== 'radio' &&
      props.type !== 'file'
    ) {
      return 'input';
    }
    return raw;
  }

  function createDomNode(resolved) {
    if (resolved === null) {
      const comment = document.createComment('');
      comment.__vnode = null;
      return comment;
    }
    if (resolved.type === '#text') {
      const textNode = document.createTextNode(resolved.text);
      textNode.__vnode = resolved;
      return textNode;
    }
    const el = document.createElement(resolved.type);
    applyProps(el, {}, resolved.props, resolved.type);
    for (let i = 0; i < resolved.children.length; i++) {
      el.appendChild(createDomNode(resolved.children[i]));
    }
    el.__vnode = resolved;
    return el;
  }

  // Reconcile existing DOM node with new resolved vnode in-place
  function patchDom(parentDom, domNode, oldVNode, newVNode) {
    if (!domNode) {
      const created = createDomNode(newVNode);
      parentDom.appendChild(created);
      return created;
    }

    // Both null (placeholder comment)
    if (oldVNode === null && newVNode === null) {
      return domNode;
    }

    // Type changed or null <-> non-null transition: replace only this specific node
    if (
      (oldVNode === null) !== (newVNode === null) ||
      oldVNode.type !== newVNode.type ||
      (oldVNode.props?.key !== newVNode.props?.key)
    ) {
      const replacement = createDomNode(newVNode);
      parentDom.replaceChild(replacement, domNode);
      return replacement;
    }

    // Text node update
    if (newVNode.type === '#text') {
      if (domNode.nodeValue !== newVNode.text) {
        domNode.nodeValue = newVNode.text;
      }
      domNode.__vnode = newVNode;
      return domNode;
    }

    // Element node: update attributes & listeners in-place without touching the element identity
    applyProps(domNode, oldVNode.props, newVNode.props, newVNode.type);

    // Reconcile children
    const oldChildren = oldVNode.children || [];
    const newChildren = newVNode.children || [];
    const maxLen = Math.max(oldChildren.length, newChildren.length);

    for (let i = 0; i < maxLen; i++) {
      const childDom = domNode.childNodes[i];
      if (i >= newChildren.length) {
        // Remove extra trailing DOM nodes
        while (domNode.childNodes.length > newChildren.length) {
          domNode.removeChild(domNode.lastChild);
        }
        break;
      } else if (i >= oldChildren.length) {
        domNode.appendChild(createDomNode(newChildren[i]));
      } else {
        patchDom(domNode, childDom, oldChildren[i], newChildren[i]);
      }
    }

    domNode.__vnode = newVNode;
    return domNode;
  }

  let renderScheduled = false;
  function scheduleRender() {
    if (renderScheduled || !rootInstance) return;
    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      if (rootInstance) rootInstance.rerender();
    });
  }

  const ReactShim = { createElement: h, useState, useEffect, useRef, useMemo, useCallback };
  const ReactDOMShim = {
    createRoot(container) {
      rootInstance = {
        vnode: null,
        resolvedTree: undefined,
        rootDom: null,
        render(vnode) {
          this.vnode = vnode;
          this.rerender();
        },
        rerender() {
          if (!this.vnode) return;
          const nextResolved = resolveVNode(this.vnode, 'root');
          if (this.resolvedTree === undefined) {
            container.innerHTML = '';
            this.rootDom = createDomNode(nextResolved);
            container.appendChild(this.rootDom);
          } else {
            this.rootDom = patchDom(container, this.rootDom, this.resolvedTree, nextResolved);
          }
          this.resolvedTree = nextResolved;
        }
      };
      return rootInstance;
    }
  };

  if (typeof window !== 'undefined') {
    window.React = ReactShim;
    window.ReactDOM = ReactDOMShim;
  }

  return { React: ReactShim, ReactDOM: ReactDOMShim, h, useState, useEffect, useRef, useMemo, useCallback };
})();

export const React = NativeReact.React;
export const ReactDOM = NativeReact.ReactDOM;
export const h = NativeReact.h;
export const useState = NativeReact.useState;
export const useEffect = NativeReact.useEffect;
export const useRef = NativeReact.useRef;
export const useMemo = NativeReact.useMemo;
export const useCallback = NativeReact.useCallback;
