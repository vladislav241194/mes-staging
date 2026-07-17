// Keeps the legacy Gantt call surface synchronous after the first visit while
// moving the implementation itself out of the startup bundle.  Every public
// member of the runtime is a function, so stable forwarding functions let the
// application keep its existing imports and event bindings.
export function createLazyGanttRuntimeModule(dependencies = {}) {
  let runtime = null;
  let loading = null;
  const forwarded = new Map();

  const load = () => {
    if (runtime) return Promise.resolve(runtime);
    if (!loading) {
      loading = import("./render.js")
        .then(({ createGanttRuntimeModule }) => {
          runtime = createGanttRuntimeModule(dependencies);
          return runtime;
        })
        .catch((error) => {
          loading = null;
          throw error;
        });
    }
    return loading;
  };

  return new Proxy({
    load,
    isReady: () => Boolean(runtime),
  }, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key !== "string") return undefined;
      // A proxy that manufactures a `then` function is treated as a Promise
      // by Promise.resolve()/await.  The runtime is an ordinary facade, not a
      // thenable; loading is exposed explicitly through load().
      if (key === "then" || key === "catch" || key === "finally") return undefined;
      if (!forwarded.has(key)) {
        forwarded.set(key, (...args) => {
          if (!runtime) throw new Error(`Gantt runtime method ${key} was called before it loaded`);
          return runtime[key](...args);
        });
      }
      return forwarded.get(key);
    },
  });
}
