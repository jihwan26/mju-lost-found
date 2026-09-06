/**
 * 캠퍼스 정의.
 *
 * 명지대학교는 인문캠퍼스(서울)와 자연캠퍼스(용인)가 물리적으로 멀리 떨어져 있어,
 * 한쪽에서 잃어버린 물건이 다른 쪽에서 발견될 일이 사실상 없다. 그래서 게시글·검색·
 * 매칭·알림이 캠퍼스 경계를 넘지 않게 한다.
 *
 * ⚠️ buildings 목록은 확인이 필요합니다.
 *    아래 목록은 자리를 잡아 두기 위한 것이고, 실제 건물명과 다를 수 있습니다.
 *    이 배열만 고치면 등록 폼의 자동완성이 바로 따라옵니다.
 *    (자유 입력도 계속 허용하므로, 목록에 없는 장소도 그대로 쓸 수 있습니다.)
 */

export const CAMPUSES = {
  humanities: {
    key: 'humanities',
    label: '인문캠퍼스',
    city: '서울',
    buildings: [
      '본관', '명진당', '경상관', '사회과학관', '인문관', '국제관',
      '학생회관', '도서관', '체육관', '기숙사', '정문', '후문', '운동장',
    ],
  },
  natural: {
    key: 'natural',
    label: '자연캠퍼스',
    city: '용인',
    buildings: [
      '제1공학관', '제2공학관', '제3공학관', '제4공학관', '제5공학관',
      '자연과학관', '창조예술관', '방목학술정보관',
      '학생회관', '도서관', '체육관', '기숙사', '정문', '후문', '운동장',
    ],
  },
};

export const CAMPUS_KEYS = Object.keys(CAMPUSES);
export const DEFAULT_CAMPUS = 'humanities';

export function isValidCampus(value) {
  return CAMPUS_KEYS.includes(value);
}

/** 화면에 내려보낼 캠퍼스 목록(키·이름·건물). */
export function campusOptions() {
  return CAMPUS_KEYS.map((key) => ({
    key,
    label: CAMPUSES[key].label,
    city: CAMPUSES[key].city,
    buildings: CAMPUSES[key].buildings,
  }));
}
