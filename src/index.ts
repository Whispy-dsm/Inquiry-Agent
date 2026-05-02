import { startWorker } from './worker.js';

/** 명령줄 진입점입니다. 워커 초기화 실패를 프로세스 종료 코드로 전달합니다. */
startWorker().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
