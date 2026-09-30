import type { Request } from 'express';

export interface Operator {
  empNo: string;
  empName: string;
}

const DEFAULT_OPERATOR: Operator = { empNo: 'A12345', empName: '陳志明' };

/**
 * Real deployments should resolve this from an authenticated session (badge scan / SSO).
 * See README "後續建議" — auth is intentionally out of scope for this scaffold.
 */
export function getOperator(req: Request): Operator {
  const empNo = (req.header('x-emp-no') || '').trim();
  const empNameRaw = (req.header('x-emp-name') || '').trim();
  let empName = empNameRaw;
  try {
    empName = decodeURIComponent(empNameRaw);
  } catch {
    /* fall back to raw value if not percent-encoded */
  }
  if (empNo && empName) return { empNo, empName };
  return DEFAULT_OPERATOR;
}
