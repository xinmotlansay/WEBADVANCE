import type { Observable } from 'rxjs';
import type { LateCompensationRequest, OrderDashboardSummary, ReportPeriod, OrderReport } from 'shared';

export abstract class AdminDashboardApi {
  abstract summary(): Observable<OrderDashboardSummary>;
  abstract lateCompensations(): Observable<LateCompensationRequest[]>;
  abstract approveCompensation(id: string): Observable<LateCompensationRequest>;
  abstract rejectCompensation(id: string, note: string): Observable<LateCompensationRequest>;
}

export abstract class AdminReportApi {
  abstract get(period: ReportPeriod): Observable<OrderReport>;
}
