import { startWorker } from './worker.js';

/** CLI entrypoint: worker bootstrap 실패를 process exit code로 전달합니다. */
startWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
