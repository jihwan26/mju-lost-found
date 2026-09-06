/**
 * 게시물 상태 표시.
 * 알약(pill) 대신 앞에 작은 점을 찍는 방식 -- 목록에 여러 개가 늘어서도
 * 시끄럽지 않고, 색만으로 진행/완료를 훑을 수 있다.
 */
export default function StatusPill({ status }) {
  const done = status === '찾음' || status === '완료';
  return <span className={`status ${done ? 'done' : 'open'}`}>{status}</span>;
}
