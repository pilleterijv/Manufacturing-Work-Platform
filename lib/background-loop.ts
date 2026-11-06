export async function periodicJob(
  run: () => Promise<unknown>,
  intervalMs: number,
  stopped: () => boolean,
  onError: () => void,
) {
  while (!stopped()) {
    try {
      await run();
    } catch {
      onError();
    }
    const until = Date.now() + intervalMs;
    while (!stopped() && Date.now() < until)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1000, until - Date.now())),
      );
  }
}
