/**
 * 로고 마크.
 *
 * 명지대학교의 공식 UI/엠블럼은 학교 자산이라 임의로 쓰지 않는다. 대신
 * "분실물을 찾는다"는 이 서비스의 성격을 담은 자체 마크를 그린다 --
 * 학교 상징색 타일 위에 돋보기.
 *
 * 인라인 SVG 라서 이미지 파일 요청이 없고, currentColor 를 쓰지 않고 색을 직접
 * 지정해 다크 모드에서도 파란 타일이 그대로 유지된다(브랜드 색은 테마와 무관).
 */
export default function LogoMark({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <circle cx="14.5" cy="14" r="6" stroke="#ffffff" strokeWidth="2.4" />
      <path d="M19 18.5L23.5 23" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
