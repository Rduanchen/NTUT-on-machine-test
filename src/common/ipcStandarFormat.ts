export interface IpcResponse<T = any> {
    success: boolean;
    data: T | null;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
}