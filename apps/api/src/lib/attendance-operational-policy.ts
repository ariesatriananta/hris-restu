import { ApiError } from './errors.js'

export function isAttendanceOperationalDate(
  businessDate: string,
  goLiveDate: string
) {
  return businessDate >= goLiveDate
}

export function assertAttendanceOperationalDate(
  businessDate: string,
  goLiveDate: string
) {
  if (!isAttendanceOperationalDate(businessDate, goLiveDate)) {
    throw new ApiError(
      422,
      `Attendance operasional hanya berlaku mulai ${goLiveDate}.`
    )
  }
}
