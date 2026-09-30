import type { MovementDTO } from '@obe/shared';
import { formatDateTime } from './Tag';

/** 事件表格（POC v0.4 logTable）— 儀表板「最近作業」與事件紀錄頁共用 */
export function LogTable({ rows }: { rows: MovementDTO[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>時間</th>
          <th>事件</th>
          <th>S/N</th>
          <th>儲位條碼</th>
          <th>操作員</th>
          <th>備註</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.id}>
            <td className="mono">{formatDateTime(l.ts)}</td>
            <td>{l.type}</td>
            <td className="mono">{l.sn}</td>
            <td className="mono">{l.slotCode ?? '-'}</td>
            <td>
              {l.empNo} {l.empName}
            </td>
            <td className="small muted">{l.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
