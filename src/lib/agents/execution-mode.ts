/** Long company tasks are executed by the separate worker on serverless hosts. */
export function deferCompanyExecution() {
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
