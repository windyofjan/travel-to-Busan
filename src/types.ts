export interface Participant {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  title: string;       // 지출 항목 이름 (예: 점심 식사, 주유비)
  amount: number;      // 금액
  payerId: string;     // 지출한 사람의 Participant ID
  participantIds: string[]; // 이 지출을 나누어 낼 사람들의 Participant ID 목록 (기본값은 전체 참여자)
  date: string;        // 지출 날짜 (선택 사항 또는 입력 일시)
}

export interface Transaction {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}
