import { registerConfigIpc } from './config.ipc';
import { registerAuthIpc } from './auth.ipc';
import { registerStoreIpc } from './store.ipc';
import { registerJudgerIpc } from './judger.ipc';

/**
 * Register all IPC handlers.
 * Called once during app startup.
 */
export function registerAllIpc(): void {
  registerConfigIpc();
  registerAuthIpc();
  registerStoreIpc();
  registerJudgerIpc();
}
