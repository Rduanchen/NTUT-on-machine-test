import { Store } from "./runTimeStore";
import { CodeJudger } from "./judge/index";
import { LocalProgramStore } from "./localProgram";
import { ConfigSystem } from "./config";

export default class StartSystem {
  private store: Store;
  private judger: CodeJudger;
  // private localProgramStore: LocalProgramStore;
  // private configSystem: ConfigSystem;

  constructor() {
    console.log("Initializing StartSystem...");

    // 按順序初始化各個模組，確保 IPC handlers 正確註冊
    this.store = new Store();
    console.log("Store initialized");

    this.judger = new CodeJudger();
    console.log("CodeJudger initialized");

    // this.localProgramStore = new LocalProgramStore();
    // this.configSystem = new ConfigSystem();
    console.log("StartSystem initialization complete");
  }

  // 提供清理方法
  public destroy() {
    console.log("Destroying StartSystem...");
    // 在這裡可以添加清理邏輯
  }
}
