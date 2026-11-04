// Loads Ink's frozen CSV recovery parser (built from ink/csv.ink by ink/build.mjs).
// The module and its trained table are vendored; nothing is fetched from a network.
let ready;
export function loadRecovery() {
  ready ??= import('./vendor/csv-recovery/program.mjs')
    .then(async (module) => {
      const state = await module.createState();
      return (text, delimiter) => state.invoke('parse', [text, delimiter]).result;
    })
    .catch((problem) => {
      ready = undefined;
      throw problem;
    });
  return ready;
}
