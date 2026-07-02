import { Participant, Expense, Transaction } from "./types";

/**
 * 정산 금액을 계산하는 함수 (최소 거래 정산 알고리즘)
 */
export function calculateTransactions(
  participants: Participant[],
  expenses: Expense[]
): Transaction[] {
  const balances: { [id: string]: number } = {};
  
  // 참여자 잔고 초기화
  participants.forEach(p => {
    balances[p.id] = 0;
  });

  // 각 지출마다 지출자와 참가자 간의 밸런스 계산
  expenses.forEach(expense => {
    const payerId = expense.payerId;
    const amount = expense.amount;
    const sharers = expense.participantIds;

    if (sharers.length === 0) return;

    // 지출한 사람은 전체 금액만큼 플러스 잔고를 얻음
    if (balances[payerId] !== undefined) {
      balances[payerId] += amount;
    }

    // 참가자들은 1/n 만큼 마이너스 잔고를 얻음
    const share = amount / sharers.length;
    sharers.forEach(sharerId => {
      if (balances[sharerId] !== undefined) {
        balances[sharerId] -= share;
      }
    });
  });

  // 잔고가 0이 아닌 사람들만 필터링
  const netBalances = participants.map(p => ({
    id: p.id,
    name: p.name,
    balance: balances[p.id] || 0
  })).filter(b => Math.abs(b.balance) > 0.1);

  // 돈을 줘야 하는 사람 (음수 잔고)
  const debtors = netBalances
    .filter(b => b.balance < 0)
    .map(b => ({ ...b, balance: -b.balance }))
    .sort((a, b) => b.balance - a.balance);

  // 돈을 받아야 하는 사람 (양수 잔고)
  const creditors = netBalances
    .filter(b => b.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const transactions: Transaction[] = [];

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const amountToTransfer = Math.min(debtor.balance, creditor.balance);
    const roundedAmount = Math.round(amountToTransfer);

    if (roundedAmount > 0) {
      transactions.push({
        fromId: debtor.id,
        fromName: debtor.name,
        toId: creditor.id,
        toName: creditor.name,
        amount: roundedAmount
      });
    }

    debtor.balance -= amountToTransfer;
    creditor.balance -= amountToTransfer;

    if (debtor.balance < 0.1) {
      dIdx++;
    }
    if (creditor.balance < 0.1) {
      cIdx++;
    }
  }

  return transactions;
}

/**
 * 숫자를 한국 원화 형식으로 포맷팅 (예: 15,000원)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW"
  }).format(value).replace("₩", "") + "원";
}
