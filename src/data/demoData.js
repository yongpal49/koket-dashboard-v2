const weeks = ["6/16", "6/23", "6/30", "7/7", "7/14", "7/21", "7/28"];
const days = ["7/28", "7/29", "7/30", "7/31", "8/1", "8/2", "8/3"];

export const categoryOrder = ["교재", "전자기기", "생활", "의류", "스포츠", "기타"];

export const demoData = {
  core: {
    kpis: {
      current: { completed_trades: 42, trade_conversion_rate: 3.4, sale_success_rate: 61.3, guest_conversion_rate: 54.5, registration_completion_rate: 62.8 },
      previous: { completed_trades: 37, trade_conversion_rate: 2.8, sale_success_rate: 57.5, guest_conversion_rate: 52.1, registration_completion_rate: 57.7 },
    },
    completed_trades_daily: days.map((date, i) => ({ date, value: [4, 6, 5, 6, 7, 6, 8][i] })),
    weekly_conversion_trend: weeks.map((week_start, i) => ({ week_start, trade_conversion_rate: [2.7, 2.8, 2.85, 3.0, 3.1, 3.2, 3.4][i], sale_success_rate: [54, 56, 57, 58, 59, 60, 61.3][i] })),
    guest_member_mix: [{ actor_type: "guest", actors: 36 }, { actor_type: "member", actors: 64 }],
    login_required_conversion_by_feature: [
      { feature: "채팅 시작", converted_guests: 31 }, { feature: "상품 등록", converted_guests: 26 },
      { feature: "찜", converted_guests: 22 }, { feature: "예약 요청", converted_guests: 18 }, { feature: "마이페이지", converted_guests: 13 },
    ],
  },
  members: {
    kpis: {
      current: { new_guests: 318, new_members: 94, total_members: 2846, active_member_rate: 33.1, week_4_retention_rate: 27.4 },
      previous: { new_guests: 290, new_members: 81, total_members: 2754, active_member_rate: 30.7, week_4_retention_rate: 25.3 },
    },
    dau_trend: days.map((date, i) => ({ date, value: [282, 296, 290, 303, 309, 314, 318][i] })),
    wau_trend: weeks.map((week_start, i) => ({ week_start, value: [680, 702, 721, 755, 790, 821, 846][i] })),
    mau_trend: ["2월", "3월", "4월", "5월", "6월", "7월", "8월"].map((month_start, i) => ({ month_start, value: [1640, 1760, 1885, 2020, 2240, 2530, 2846][i] })),
    department_distribution: [
      ["컴퓨터공학부", 548], ["산업경영학부", 411], ["기계공학부", 348], ["전자공학과", 302], ["디자인·건축", 258],
    ].map(([department_code, members]) => ({ department_code, members })),
    account_status_distribution: [{ status: "활성", members: 72 }, { status: "휴면", members: 21 }, { status: "탈퇴", members: 7 }],
    cumulative_members_weekly: weeks.map((week_start, i) => ({ week_start, members: [1845, 2065, 2255, 2437, 2606, 2730, 2846][i] })),
    withdrawals_weekly: weeks.map((week_start, i) => ({ week_start, withdrawal_rate: [1.9, 1.8, 1.65, 1.55, 1.3, 1.2, 1.2][i] })),
    retention_cohorts: [
      { cohort_week: "7/1", weeks: [100, 56, 42, 35, 28] }, { cohort_week: "7/8", weeks: [100, 53, 40, 37, null] },
      { cohort_week: "7/15", weeks: [100, 61, 48, null, null] }, { cohort_week: "7/22", weeks: [100, 59, null, null, null] }, { cohort_week: "7/29", weeks: [100, null, null, null, null] },
    ],
    activity_status_distribution: [{ status: "활성 회원", members: 2049 }, { status: "휴면 회원", members: 598 }],
    dormant_period_distribution: [{ bucket: "30–59일", members: 311 }, { bucket: "60–89일", members: 185 }, { bucket: "90일 이상", members: 102 }],
    reactivation: { dormant_members_at_start: 645, reactivated_members: 146, reactivation_rate: 22.6 },
    platform_distribution: [{ platform: "android", actors: 1968 }, { platform: "ios", actors: 878 }],
    app_version_distribution: [
      { platform: "android", app_version: "1.3.2", actors: 1210 }, { platform: "android", app_version: "1.3.1", actors: 758 },
      { platform: "ios", app_version: "1.2.4", actors: 531 }, { platform: "ios", app_version: "1.2.3", actors: 347 },
    ],
  },
  supply: {
    kpis: {
      current: { new_items: 186, unique_sellers: 112, average_items_per_seller: 1.66, completed_sales: 42, average_days_to_sell: 4.2 },
      previous: { new_items: 159, unique_sellers: 100, average_items_per_seller: 1.54, completed_sales: 37, average_days_to_sell: 5.0 },
    },
    new_items_and_sellers_weekly: weeks.map((week_start, i) => ({ week_start, new_items: [91, 109, 118, 132, 151, 164, 186][i], unique_sellers: [52, 67, 73, 75, 92, 104, 112][i] })),
    item_status_snapshot: [{ status: "판매 중", items: 61 }, { status: "예약", items: 14 }, { status: "판매 완료", items: 19 }, { status: "숨김", items: 6 }],
    selling_items_by_category: [["교재", 186], ["전자기기", 98], ["생활", 64], ["의류", 48], ["스포츠", 38], ["기타", 31]].map(([category_name, items]) => ({ category_name, items })),
    items_per_seller_distribution: [["1개", 64], ["2개", 25], ["3개", 14], ["4개", 5], ["5개", 3], ["6개+", 1]].map(([bucket, sellers]) => ({ bucket, sellers })),
    unsold_item_age_distribution: [["0–7일", 100], ["8–14일", 42], ["15–29일", 23], ["30일 이상", 12]].map(([bucket, items]) => ({ bucket, items })),
    unsold_item_age_by_category: categoryOrder.flatMap((category_name, i) => [
      ["0–7일", [66, 55, 61, 48, 52, 46][i]], ["8–14일", [20, 25, 18, 27, 22, 25][i]], ["15–29일", [8, 13, 12, 14, 15, 17][i]], ["30일 이상", [6, 7, 9, 11, 11, 12][i]],
    ].map(([bucket, items]) => ({ category_name, bucket, items }))),
    sale_duration_distribution: [["0–1일", 40], ["1–2일", 72], ["2–3일", 94], ["3–5일", 76], ["5–7일", 62], ["7–10일", 42], ["10–14일", 22], ["14일+", 20]].map(([bucket, items]) => ({ bucket, items })),
  },
  engagement: {
    kpis: {
      current: { favorite_users: 428, active_chat_rooms: 286, reservations: 91, completed_trades: 42, review_rate: 68.3 },
      previous: { favorite_users: 394, active_chat_rooms: 253, reservations: 84, completed_trades: 37, review_rate: 71.5 },
    },
    weekly_trends: weeks.map((week_start, i) => ({ week_start, favorite_users: [214, 248, 279, 302, 348, 389, 428][i], favorite_items: [128, 145, 167, 184, 211, 238, 267][i], active_chat_rooms: [171, 188, 209, 224, 247, 265, 286][i], messages: [780, 845, 930, 1030, 1136, 1250, 1378][i], reservations: [48, 53, 62, 68, 73, 85, 91][i], completed_trades: [29, 34, 31, 38, 41, 37, 42][i] })),
    completed_trades_by_category: [["교재", 16], ["전자기기", 12], ["생활", 7], ["의류", 4], ["스포츠", 2], ["기타", 1]].map(([category_name, trades]) => ({ category_name, trades })),
    favorites_by_category: [["전자기기", 102], ["교재", 87], ["생활", 65], ["의류", 52], ["스포츠", 42], ["기타", 30]].map(([category_name, favorites]) => ({ category_name, favorites })),
    reservation_status_weekly: ["6/30", "7/7", "7/14", "7/21", "7/28"].flatMap((week_start, i) => [["요청", [34, 36, 35, 34, 34][i]], ["확정", [31, 33, 31, 31, 31][i]], ["완료", [25, 28, 27, 27, 29][i]], ["취소", [10, 9, 7, 8, 6][i]]].map(([status, trades]) => ({ week_start, status, trades }))),
    trade_place_distribution: [["학생회관", 16], ["담헌실학관", 11], ["복지관", 7], ["공학관", 5], ["기타", 3]].map(([meeting_place, trades]) => ({ meeting_place, trades })),
    trade_time_of_day_distribution: [["오전", 5], ["점심", 11], ["오후", 18], ["저녁", 8]].map(([time_bucket, trades]) => ({ time_bucket, trades })),
    trade_hour_distribution: [9, 11, 13, 15, 17, 19, 21].map((hour, i) => ({ hour, trades: [2, 4, 7, 10, 9, 7, 3][i] })),
    trade_weekday_distribution: [1, 2, 3, 4, 5, 6, 7].map((iso_weekday, i) => ({ iso_weekday, trades: [5, 4, 6, 7, 9, 6, 5][i] })),
  },
  funnels: {
    guest_to_member: { observation_window_days: 30, stages: [["login_required", 398, 100], ["start_sign_up", 294, 73.9], ["school_verification_completed", 241, 60.6], ["sign_up", 217, 54.5]].map(([stage, actors, rate_from_start]) => ({ stage, actors, rate_from_start })) },
    item_registration: { observation_window_hours: 24, stages: [["start_item_registration", 312, 100], ["add_item_image", 274, 87.8], ["select_item_category", 252, 80.8], ["preview_item", 227, 72.8], ["create_item", 196, 62.8]].map(([stage, attempts, rate_from_start]) => ({ stage, attempts, rate_from_start })) },
    trade_completion: { observation_window_days: 7, stages: [["view_item", 1240, 100], ["chat_started", 286, 23.1], ["trade_created", 91, 7.3], ["trade_completed", 42, 3.4]].map(([stage, actors, rate_from_start]) => ({ stage, actors, rate_from_start })) },
  },
  operations: {
    reservation_fulfillment: { reserved_trades: 91, completed_trades: 42, fulfillment_rate: 46.2, cancelled_or_verified_no_show_trades: 8, cancel_or_no_show_rate: 8.8 },
    reports: { received_in_period: 7, current_backlog: 3, resolution_sla: { resolved_reports: 4, median_hours: 5.2, p90_hours: 18.4 } },
    notification_read_performance: [{ notification_type: "채팅", notifications: 286, read_rate: 81.5 }, { notification_type: "예약", notifications: 91, read_rate: 76.9 }, { notification_type: "가격 인하", notifications: 64, read_rate: 58.3 }],
  },
};

export const demoPeriod = { start_date: "2026-07-28", end_date: "2026-08-03", timezone: "Asia/Seoul" };
