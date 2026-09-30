// Verified against public schema/check constraints on 2026-09-28.
// Unknown values stay visible so new DB labels are not silently discarded.
export const LABEL_CONTRACT_VERSION = '20260928.1';
export const ACCOUNT_STATUS_LABELS = {
  active: '정상', withdrawal_pending: '탈퇴 처리 중', withdrawn: '탈퇴',
  suspended: '이용 정지', dormant: '휴면', unknown: '상태 미확인',
};
export const ITEM_STATUS_LABELS = {
  selling: '판매 중', reserved: '예약', sold: '판매 완료', hidden: '숨김', deleted: '삭제',
};
export const TRADE_STATUS_LABELS = {
  requested: '요청', change_proposed: '변경 제안', reserved: '확정',
  rejected: '거절', cancelled: '취소', completion_pending: '완료 확인 중', completed: '완료',
  confirmed: '확정', no_show: '노쇼', // Display compatibility only.
};
export const NOTIFICATION_LABELS = {
  chat_message_received: '채팅 메시지 수신', trade_request_received: '거래 요청 수신',
  trade_reserved: '거래 예약 확정', trade_completed: '거래 완료', trade_cancelled: '거래 취소',
  trade_change_proposed: '거래 변경 제안', trade_rejected: '거래 거절',
  trade_completion_requested: '거래 완료 확인 요청', review_received: '후기 수신',
  report_received: '신고 접수', report_resolved: '신고 처리 완료', keyword_match: '키워드 알림',
  item_price_dropped: '상품 가격 인하', system_notice: '시스템 공지',
};
export const REPORT_STATUS_LABELS = { received: '접수', reviewing: '검토 중', resolved: '처리 완료', closed: '종결' };
export const REPORT_TYPE_LABELS = { item: '상품', chat: '채팅', user: '사용자', review: '후기' };
export const EVENT_LABELS = {
  login_required: '로그인 필요', start_sign_up: '가입 시작', sign_up_code_requested: '인증 코드 요청',
  school_verification_completed: '학교 인증', sign_up: '가입 완료', profile_completed: '프로필 완료',
  start_item_registration: '등록 시작', add_item_image: '이미지 추가', select_item_category: '카테고리 선택',
  preview_item: '미리보기', create_item: '등록 완료', view_item: '상품 조회',
  add_to_wishlist: '찜 추가', chat_started: '채팅 시작', message_sent: '메시지 전송',
  trade_created: '거래 예약', trade_completed: '거래 완료', review_submitted: '후기 작성',
};
export const DORMITORY_CODES = ['101', '102', '103', '104', '105', '106', '201', '202', '203', '204', '205'];
export function displayLabel(labels, value) {
  return Object.hasOwn(labels, value) ? labels[value] : String(value ?? '미입력');
}
export function dormitoryLabel(value, item = false) {
  if (!value) return item ? '비공개/미설정' : '선택 안 함';
  if (DORMITORY_CODES.includes(value)) return `${value}동`;
  return displayLabel({ off_campus: '생활관 미거주', other: '그 외 생활관' }, value);
}
