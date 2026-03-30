export function log(context: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${context}] ${message}`, data ? JSON.stringify(data) : "");
}

export function logError(context: string, message: string, error?: any) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${context}] ERROR: ${message}`, error?.message || error || "");
}
