export interface ApiResponse<T = any> {
    success: boolean;
    statusCode: number;
    message: string;
    data: T | null;
}
