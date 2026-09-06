/**
 * 여러 화면이 함께 쓰는 상수와 작은 순수 함수들.
 * (카테고리·신고 사유 목록처럼 서버가 정하는 값은 여기가 아니라 /api/me 응답으로 내려온다.)
 */

/**
 * 찾아요/찾았어요 두 게시판의 차이를 한 곳에 모아 둔 표.
 * 두 게시판의 화면 구조가 완전히 대칭이라, 컴포넌트는 한 벌만 만들고
 * 라벨·필드명·상태 목록만 여기서 갈아 끼운다.
 */
export const BOARD_META = {
  lost: {
    title: '찾아요',
    heading: '찾아요 게시판',
    subtitle: '잃어버린 물건을 등록하고 찾아보세요.',
    dateField: 'lost_at',
    dateLabel: '분실',
    statuses: ['전체', '찾는 중', '찾음'],
    // AI 의미 검색은 *반대편* 게시판을 뒤진다: 분실 글을 보다가 검색하면 습득물이 나온다.
    aiTargetKind: 'found',
    aiStatuses: ['전체', '보관 중', '완료'],
    aiHint: '예: 검은색 에어팟을 도서관에서 잃어버렸어요',
    aiResultNote: '검색어와 의미가 비슷한 찾았어요 게시판의 습득물입니다.',
    matchButton: 'AI로 비슷한 습득물 찾기',
  },
  found: {
    title: '찾았어요',
    heading: '찾았어요 게시판',
    subtitle: '주운 물건을 등록해 주인을 찾아주세요.',
    dateField: 'found_at',
    dateLabel: '습득',
    statuses: ['전체', '보관 중', '완료'],
    aiTargetKind: 'lost',
    aiStatuses: ['전체', '찾는 중', '찾음'],
    aiHint: '예: 도서관에서 검은색 무선 이어폰을 주웠어요',
    aiResultNote: '검색어와 의미가 비슷한 찾아요 게시판의 분실물입니다.',
    matchButton: 'AI로 비슷한 분실물 찾기',
  },
};

// ---------------------------------------------------------------- 알림

export const NOTIFICATION_TYPE_LABELS = {
  message: '새 메시지',
  match: '새 매칭',
  report_processed: '신고 처리 결과',
  post_deleted: '게시물 삭제 제재',
  message_hidden: '메시지 숨김 제재',
  user_suspended: '계정 정지',
};

// ---------------------------------------------------------------- 관리자

export const REPORT_STATUS_LABELS = { pending: '처리 대기', dismissed: '반려', actioned: '조치 완료' };
export const TARGET_TYPE_LABELS = { post: '게시물', message: '메시지', user: '사용자' };
export const ACTION_TYPE_LABELS = {
  delete_post: '게시물 삭제',
  hide_message: '메시지 숨김',
  suspend_user: '사용자 정지',
};
// target_type 하나당 적용 가능한 조치는 하나뿐이다. 실제 강제는 서버(db.applyReportAction)가 한다.
export const TARGET_TYPE_TO_ACTION = {
  post: 'delete_post',
  message: 'hide_message',
  user: 'suspend_user',
};

// ---------------------------------------------------------------- 날짜 입력 기본값

/** 오늘 날짜 (YYYY-MM-DD). <input type="date"> 의 기본값용. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 현재 시각 (HH:MM). <input type="time"> 의 기본값용. */
export function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
