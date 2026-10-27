/**
 * sk.issue-rules.js
 * P2-0049: одно правило «открыто / просрочено» для замечаний стройконтроля во всей Аналитике
 * (решения владельца 28.10.2026):
 *  - открыто, пока инженер не поставил «Проверено»; «Устранено» подрядчиком — тоже открыто
 *    («ждёт проверки», отдельной строкой);
 *  - просрочка — два числа: «просрочено сейчас» (открыто, срок прошёл) и «закрыто с опозданием»
 *    (проверено, фактическая дата устранения позже срока).
 * Дата закрытия — date_resolved (фактическая дата устранения из реестра СК): отдельной даты
 * проверки в записи нет.
 */

function _date(v) {
  if (!v) return null;
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Закрыто инженером («Проверено»). */
export function isIssueVerified(record) {
  if (!record) return false;
  if (record.is_verified_closed === true) return true;
  if (record.status_normalized === 'verified') return true;
  var s = String(record.status || record.status_raw || '').toLowerCase().trim();
  return s === 'проверено';
}

/** Открыто сейчас: всё, что инженер не перевёл в «Проверено». */
export function isIssueOpen(record) {
  if (!record) return false;
  return !isIssueVerified(record);
}

/** «Устранено» подрядчиком, но ещё не проверено инженером. */
export function isIssueAwaitingVerification(record) {
  if (!record || isIssueVerified(record)) return false;
  if (record.status_normalized === 'fixed_claimed') return true;
  var s = String(record.status || record.status_raw || '').toLowerCase().trim();
  return s === 'устранено';
}

/** Просрочено сейчас: открыто и срок прошёл к моменту `at` (по умолчанию — сейчас). */
export function isIssueOverdueNow(record, at) {
  if (!isIssueOpen(record)) return false;
  var deadline = _date(record.deadline);
  var now = _date(at) || new Date();
  return !!deadline && now > deadline;
}

/** Закрыто с опозданием: проверено, и фактическое устранение позже срока. */
export function isIssueClosedLate(record) {
  if (!isIssueVerified(record)) return false;
  var deadline = _date(record.deadline);
  var resolved = _date(record.date_resolved);
  return !!deadline && !!resolved && resolved > deadline;
}

/** Дней просрочки: для открытого — до `at`, для закрытого с опозданием — до устранения; иначе 0. */
export function issueOverdueDays(record, at) {
  var deadline = _date(record && record.deadline);
  if (!deadline) return 0;
  if (isIssueOverdueNow(record, at)) {
    var now = _date(at) || new Date();
    return Math.ceil((now - deadline) / 86400000);
  }
  if (isIssueClosedLate(record)) {
    return Math.ceil((_date(record.date_resolved) - deadline) / 86400000);
  }
  return 0;
}

/**
 * Стройконтроль за период [start; end] по единому правилу.
 * Закрытие замечания в прошлом восстанавливается по date_resolved у проверенных записей.
 */
export function skPeriodStats(records, start, end) {
  var s = _date(start), e = _date(end);
  var r = {
    issued: 0, closed: 0, closedOnTime: 0, closedLate: 0, lateDays: [],
    open: 0, awaiting: 0, overdueNow: 0
  };
  (records || []).forEach(function (rec) {
    var issued = _date(rec.date_issued);
    if (!issued || issued > e) return;
    if (issued >= s) r.issued++;
    var verified = isIssueVerified(rec);
    var resolved = _date(rec.date_resolved);
    var deadline = _date(rec.deadline);
    // Закрыто в периоде: проверено и устранено в границах периода.
    if (verified && resolved && resolved >= s && resolved <= e) {
      r.closed++;
      if (deadline && resolved > deadline) {
        r.closedLate++;
        r.lateDays.push(Math.ceil((resolved - deadline) / 86400000));
      } else {
        r.closedOnTime++;
      }
    }
    // Открыто на конец периода: не проверено, либо проверено, но устранено позже конца периода.
    var openAtEnd = !verified || !resolved || resolved > e;
    if (openAtEnd) {
      r.open++;
      if (isIssueAwaitingVerification(rec) && (!resolved || resolved <= e)) r.awaiting++;
      if (deadline && deadline < e) r.overdueNow++;
    }
  });
  r.onTimePerc = r.closed > 0 ? Math.round((r.closedOnTime / r.closed) * 100) : null;
  r.avgLateDays = r.lateDays.length > 0
    ? Math.round(r.lateDays.reduce(function (a, b) { return a + b; }, 0) / r.lateDays.length)
    : 0;
  return r;
}
