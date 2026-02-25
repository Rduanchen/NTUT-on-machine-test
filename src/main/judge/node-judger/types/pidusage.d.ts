declare module 'pidusage' {
    export interface Stat {
        cpu: number;
        memory: number;
        ctime: number;
        elapsed: number;
        timestamp: number;
    }

    export type Pid = number | number[];

    interface PidusageFn {
        (pid: Pid): Promise<Stat>;
        (pid: Pid, callback: (err: Error | null, stat: Stat) => void): void;
        clear(pid?: Pid): void;
    }

    const pidusage: PidusageFn;
    export default pidusage;
}
