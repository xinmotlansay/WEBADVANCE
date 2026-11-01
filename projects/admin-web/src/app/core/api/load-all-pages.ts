import { EMPTY, expand, reduce, type Observable } from 'rxjs';
import type { ApiPageResponse } from 'shared';

export function loadAllPages<T>(
  loadPage: (page: number, limit: number) => Observable<ApiPageResponse<T>>,
  limit = 100,
): Observable<T[]> {
  return loadPage(1, limit).pipe(
    expand((response) =>
      response.meta.page < response.meta.totalPages
        ? loadPage(response.meta.page + 1, limit)
        : EMPTY,
    ),
    reduce((items, response) => items.concat(response.data), [] as T[]),
  );
}
