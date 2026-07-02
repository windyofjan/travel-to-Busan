import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trash2,
  UserPlus,
  CheckCircle2,
  Wallet
} from "lucide-react";
import { Participant, Expense } from "./types";
import { calculateTransactions, formatCurrency } from "./utils";
import BaseballStitch from "./components/BaseballStitch";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// 기본 초기 샘플 데이터
const INITIAL_PARTICIPANTS: Participant[] = [
  { id: "p1", name: "🌊 신혜" },
  { id: "p2", name: "🐯 선경" }
];

const INITIAL_EXPENSES: Expense[] = [
  {
    id: "e1",
    title: "KTX 왕복 열차표",
    amount: 118000,
    payerId: "p1",
    participantIds: ["p1", "p2"],
    date: "2026-07-01"
  },
  {
    id: "e2",
    title: "호텔 숙박 예약",
    amount: 180000,
    payerId: "p2",
    participantIds: ["p1", "p2"],
    date: "2026-07-01"
  },
  {
    id: "e3",
    title: "저녁 바비큐 식사",
    amount: 94000,
    payerId: "p1",
    participantIds: ["p1", "p2"],
    date: "2026-07-01"
  },
  {
    id: "e4",
    title: "해변 카페 투어",
    amount: 32000,
    payerId: "p2",
    participantIds: ["p1", "p2"],
    date: "2026-07-02"
  }
];

const getRoomIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  return room ? room.trim() : "tigers_vs_giants";
};

export default function App() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [completedTransactions, setCompletedTransactions] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);

  // 새 참가자 이름 입력 상태
  const [newParticipantName, setNewParticipantName] = useState("");

  // 새 지출 양식 상태
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<number | "">("");
  const [expensePayerId, setExpensePayerId] = useState("");
  const [expenseSharers, setExpenseSharers] = useState<string[]>([]);
  const [expenseDate, setExpenseDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // 커스텀 토스트 알림 상태
  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "info" } | null>(null);

  // 커스텀 컨펌 모달 상태
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: "error" | "success" | "info" = "info") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const askConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      }
    });
  };

  // 1. Firebase 실시간 데이터 구독 및 자동 초기화
  useEffect(() => {
    const roomId = getRoomIdFromUrl();
    const docRef = doc(db, "rooms", roomId);

    const unsubscribe = onSnapshot(docRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setParticipants(data.participants || []);
        setExpenses(data.expenses || []);
        setCompletedTransactions(data.completedTransactions || {});
        setLoading(false);
      } else {
        // 방이 없으면 초기값 세팅 후 대기
        try {
          await setDoc(docRef, {
            participants: INITIAL_PARTICIPANTS,
            expenses: INITIAL_EXPENSES,
            completedTransactions: {}
          });
        } catch (err) {
          console.error("Firebase init doc failed:", err);
        }
        setLoading(false);
      }
    }, (error) => {
      console.error("Firebase Sync Error:", error);
      showToast("실시간 연동 도중 오류가 발생했습니다.", "error");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. 참가자 목록 변경될 때 디폴트 페이어 및 분할자 설정 (무한루프 방지 및 누락된 친구 자동 추가 포함)
  useEffect(() => {
    if (participants.length > 0) {
      if (!expensePayerId || !participants.some(p => p.id === expensePayerId)) {
        const defaultPayer = participants.find(p => p.name.includes("신혜")) || participants[0];
        setExpensePayerId(defaultPayer.id);
      }
      setExpenseSharers(prev => {
        const activeIds = participants.map(p => p.id);
        const nextSharers = prev.filter(id => activeIds.includes(id));
        activeIds.forEach(id => {
          if (!nextSharers.includes(id)) {
            nextSharers.push(id);
          }
        });
        return nextSharers;
      });
    } else {
      setExpenseSharers([]);
    }
  }, [participants]);

  // Firebase Firestore에 데이터 원자적 저장 헬퍼
  const updateRoomData = async (
    updatedParticipants: Participant[],
    updatedExpenses: Expense[],
    updatedCompletedTransactions: { [key: string]: boolean } = completedTransactions
  ) => {
    const roomId = getRoomIdFromUrl();
    const docRef = doc(db, "rooms", roomId);
    try {
      await setDoc(docRef, {
        participants: updatedParticipants,
        expenses: updatedExpenses,
        completedTransactions: updatedCompletedTransactions
      });
    } catch (err: any) {
      console.error("Failed to sync with Firebase:", err);
      showToast(`저장 실패: ${err.message || err.code || "네트워크 장애"}`, "error");
    }
  };

  // 새로운 참가자 추가
  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newParticipantName.trim();
    if (!trimmed) return;

    if (participants.some(p => p.name === trimmed)) {
      showToast("이미 존재하는 이름입니다.", "error");
      return;
    }

    const newParticipant: Participant = {
      id: "p_" + Date.now(),
      name: trimmed
    };

    const updatedParticipants = [...participants, newParticipant];
    await updateRoomData(updatedParticipants, expenses);
    setNewParticipantName("");
    showToast(`${trimmed} 친구가 추가되었습니다!`, "success");
  };

  // 참가자 삭제
  const handleRemoveParticipant = (id: string) => {
    const target = participants.find(p => p.id === id);
    if (!target) return;

    askConfirm(
      "친구 제외",
      `정말로 '${target.name}' 친구를 정산에서 제외하시겠습니까? 관련 지출 내역에서도 이 친구가 모두 제외됩니다.`,
      async () => {
        const remainingParticipants = participants.filter(p => p.id !== id);
        
        const updatedExpenses = expenses.map(exp => {
          let newPayerId = exp.payerId;
          if (exp.payerId === id) {
            const firstRemaining = remainingParticipants[0];
            newPayerId = firstRemaining ? firstRemaining.id : "";
          }
          return {
            ...exp,
            payerId: newPayerId,
            participantIds: exp.participantIds.filter(pId => pId !== id)
          };
        }).filter(exp => exp.participantIds.length > 0);

        await updateRoomData(remainingParticipants, updatedExpenses);

        if (expensePayerId === id) {
          const remaining = remainingParticipants[0];
          setExpensePayerId(remaining ? remaining.id : "");
        }
        setExpenseSharers(expenseSharers.filter(pId => pId !== id));
        showToast("친구가 제외되었습니다.", "info");
      }
    );
  };

  // 지출 등록
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim()) {
      showToast("지출 항목 이름을 입력해주세요.", "error");
      return;
    }
    if (!expenseAmount || expenseAmount <= 0) {
      showToast("올바른 금액을 입력해주세요.", "error");
      return;
    }
    if (!expensePayerId) {
      showToast("지출한 사람을 선택해주세요.", "error");
      return;
    }
    if (expenseSharers.length === 0) {
      showToast("이 지출을 나누어 낼 사람을 최소 1명 이상 선택해주세요.", "error");
      return;
    }

    const newExpense: Expense = {
      id: "e_" + Date.now(),
      title: expenseTitle.trim(),
      amount: Number(expenseAmount),
      payerId: expensePayerId,
      participantIds: [...expenseSharers],
      date: expenseDate || new Date().toISOString().split("T")[0]
    };

    const updatedExpenses = [newExpense, ...expenses];
    await updateRoomData(participants, updatedExpenses);
    setExpenseTitle("");
    setExpenseAmount("");
    showToast("지출 내역이 성공적으로 추가되었습니다.", "success");
  };

  // 지출 내역 삭제
  const handleRemoveExpense = async (id: string) => {
    const updatedExpenses = expenses.filter(exp => exp.id !== id);
    await updateRoomData(participants, updatedExpenses);
    showToast("지출 항목이 삭제되었습니다.", "info");
  };

  // 함께할 멤버 토글
  const handleToggleSharer = (id: string) => {
    if (expenseSharers.includes(id)) {
      setExpenseSharers(expenseSharers.filter(pId => pId !== id));
    } else {
      setExpenseSharers([...expenseSharers, id]);
    }
  };

  // 전체 참여자 선택/해제 토글
  const handleToggleAllSharers = () => {
    if (expenseSharers.length === participants.length) {
      setExpenseSharers([]);
    } else {
      setExpenseSharers(participants.map(p => p.id));
    }
  };

  // 송금 완료 여부 실시간 저장 토글
  const handleToggleTransactionCompleted = async (key: string, isChecked: boolean) => {
    const updatedCompletedTransactions = {
      ...completedTransactions,
      [key]: !isChecked
    };
    await updateRoomData(participants, expenses, updatedCompletedTransactions);
  };

  const transactions = calculateTransactions(participants, expenses);
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E8E1D5] text-[#002D62] flex flex-col items-center justify-center font-sans border-[12px] border-[#002D62] p-8">
        <div className="text-center space-y-4">
          <div className="text-6xl animate-bounce select-none">⚾️</div>
          <h2 className="text-2xl font-black italic tracking-tight">TIGERS vs GIANTS</h2>
          <p className="text-xs font-mono tracking-widest uppercase opacity-75">
            Loading Stadium seats & scoreboard...
          </p>
          <div className="w-16 h-1 bg-[#BA0C2F] mx-auto animate-pulse mt-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E8E1D5] text-[#002D62] flex flex-col font-sans border-[12px] border-[#002D62] relative bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px]">
      
      {/* 1. High Density 메인 헤더 (네이비 & 레드 & 화이트 로고 데코) */}
      <header className="bg-[#002D62] p-6 flex flex-col md:flex-row justify-between items-center border-b-4 border-[#BA0C2F] shadow-lg relative overflow-hidden gap-4">
        <div className="flex items-center gap-4">
          <div className="text-4xl shrink-0 animate-bounce select-none">
            ⚾️
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter italic">
              TIGERS vs GIANTS
            </h1>
          </div>
        </div>
      </header>

      {/* 야구공 실밥 무늬 데코레이션 탑라인 */}
      <BaseballStitch className="my-0 opacity-100" />

      {/* 2. 메인 컨텐트 레이아웃 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 md:gap-8">
        
        {/* 상단 2열: 지출 등록(좌) + 스코어보드 & 목록(우) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
          
          {/* ================= LEFT SIDE: INPUT FORMS (5 Cols) ================= */}
          <section className="lg:col-span-5 flex flex-col gap-6 md:gap-8">
            
            {/* B. 지출 항목 등록 카드 */}
            <div className="bg-white border-2 border-[#002D62] p-5 shadow-[4px_4px_0px_#002D62] relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-[#002D62]">
                <div className="w-3 h-3 bg-[#005A32] rounded-full" />
                <h2 className="font-black text-[#002D62] text-xl uppercase tracking-tight flex-1">
                  지출 내역 등록
                </h2>
                <span className="font-mono text-[10px] text-slate-400 font-bold">EXPENSES</span>
              </div>

              {participants.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#BA0C2F] font-bold bg-[#BA0C2F]/5 border-2 border-dashed border-[#BA0C2F] p-4">
                  지출을 기록하기 전에 먼저 하단의 '여행 친구 등록' 구역에서 친구를 한 명 이상 등록해 주세요.
                </div>
              ) : (
                <form onSubmit={handleAddExpense} className="space-y-4">
                  {/* 지출 항목명 */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#002D62] mb-1 uppercase tracking-wider">
                      지출 항목 이름
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="예: 점심 식사, 주유비"
                      value={expenseTitle}
                      onChange={(e) => setExpenseTitle(e.target.value)}
                      className="w-full border-2 border-[#002D62] p-2 rounded-none focus:outline-none focus:bg-yellow-50 text-slate-800 placeholder:text-slate-400 font-bold text-sm"
                    />
                  </div>

                  {/* 지출 금액 및 날짜 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-[#002D62] mb-1 uppercase tracking-wider">
                        금액 (원)
                      </label>
                      <input
                        type="number"
                        required
                        min={1}
                        placeholder="금액"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full border-2 border-[#002D62] p-2 rounded-none focus:outline-none focus:bg-yellow-50 text-slate-800 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#002D62] mb-1 uppercase tracking-wider">
                        지출 날짜
                      </label>
                      <input
                        type="date"
                        required
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        className="w-full border-2 border-[#002D62] p-1.5 rounded-none focus:outline-none focus:bg-yellow-50 text-slate-800 font-mono text-sm"
                      />
                    </div>
                  </div>

                  {/* 지출한 사람 */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#002D62] mb-1 uppercase tracking-wider">
                      지출한 사람
                    </label>
                    <select
                      value={expensePayerId}
                      onChange={(e) => setExpensePayerId(e.target.value)}
                      className="w-full border-2 border-[#002D62] p-2 rounded-none focus:outline-none focus:bg-yellow-50 font-bold text-slate-800 text-sm"
                    >
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 함께한 사람 */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-[#002D62] uppercase tracking-wider">
                        함께 비용을 분할할 친구
                      </label>
                      <button
                        type="button"
                        onClick={handleToggleAllSharers}
                        className="text-[11px] text-[#BA0C2F] hover:underline font-bold"
                      >
                        {expenseSharers.length === participants.length ? "전체 해제" : "전체 선택"}
                      </button>
                    </div>
                    
                    <div className="border-2 border-[#002D62] p-3 bg-[#E8E1D5]/40 max-h-36 overflow-y-auto grid grid-cols-2 gap-2">
                      {participants.map((p) => {
                        const isChecked = expenseSharers.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleToggleSharer(p.id)}
                            className={`flex items-center gap-2 p-1.5 text-left text-xs font-bold transition-all border ${
                              isChecked
                                ? "bg-white text-[#002D62] border-[#002D62]"
                                : "bg-transparent text-slate-500 border-transparent hover:bg-white/50"
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 border-2 flex items-center justify-center transition-all ${
                              isChecked ? "bg-[#002D62] border-[#002D62]" : "border-slate-400"
                            }`}>
                              {isChecked && <div className="w-1.5 h-1.5 bg-white" />}
                            </div>
                            <span className="truncate">{p.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 등록 버튼 */}
                  <button
                    type="submit"
                    className="w-full bg-[#002D62] text-white font-black py-3 hover:bg-[#BA0C2F] transition-colors border-2 border-[#002D62] uppercase tracking-widest shadow-[3px_3px_0px_#BA0C2F] active:translate-y-[2px] active:shadow-none"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    지출 항목 저장하기
                  </button>
                </form>
              )}
            </div>
          </section>

          {/* ================= RIGHT SIDE: SCOREBOARD & RESULT MAP (7 Cols) ================= */}
          <section className="lg:col-span-7 flex flex-col gap-6 md:gap-8">
            
            {/* C. High Density 그린 스타디움 스코어보드 */}
            <div className="bg-[#005A32] border-2 border-[#002D62] p-5 md:p-6 shadow-[4px_4px_0px_#002D62] text-white relative overflow-hidden">
              {/* 상단 스코어보드 라벨 */}
              <div className="flex justify-between items-end mb-4 border-b border-white/20 pb-3">
                <h3 className="font-black text-xl uppercase tracking-tight text-white flex items-center gap-2">
                  <span className="bg-[#BA0C2F] text-white px-2 py-0.5 text-xs font-mono">B_STATS</span>
                  총 여행 지출 대시보드
                </h3>
                <span className="text-xs font-mono opacity-70">UNIT: KRW (₩)</span>
              </div>

              {/* 메인 밸런스 전광판 */}
              <div className="mb-5">
                <div className="bg-[#002D62]/40 border-2 border-white/20 p-4 text-center shadow-inner">
                  <span className="text-[10px] font-bold text-[#E8E1D5] block mb-1 uppercase tracking-widest">
                    총 지출
                  </span>
                  <span className="text-2xl md:text-3xl font-mono font-black text-white leading-none">
                    {formatCurrency(totalSpent)}
                  </span>
                </div>
              </div>

              {/* 최종 정산 요약 섹션 */}
              <div className="pt-4 border-t border-white/20">
                <div className="flex justify-between items-center mb-4">
                  <span className="bg-white text-[#BA0C2F] px-3 py-1 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#002D62]">
                    FINAL SETTLEMENT
                  </span>
                </div>

                {transactions.length === 0 ? (
                  <div className="bg-white/10 rounded-none p-6 text-center text-xs text-[#E8E1D5] italic border border-white/10">
                    {expenses.length === 0
                      ? "등록된 지출 내역이 없어 전광판 결과가 비어있습니다."
                      : "모두가 정확하게 1/n로 사용하여 보낼 정산금이 없습니다!"}
                  </div>
                ) : (
                  <div className="space-y-3.5 max-h-[190px] overflow-y-auto pr-1">
                    {transactions.map((t, idx) => {
                      const key = `${t.fromId}-${t.toId}-${t.amount}`;
                      const isChecked = completedTransactions[key] || false;
                      
                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => {
                            handleToggleTransactionCompleted(key, isChecked);
                          }}
                          className={`flex items-center justify-between p-3.5 rounded-none border-2 cursor-pointer transition-all ${
                            isChecked
                              ? "bg-white/5 border-white/10 opacity-30"
                              : "bg-white/10 hover:bg-white/20 border-white/20"
                          }`}
                        >
                          {/* 정산 방향 설명 */}
                          <div className="flex items-center gap-3 text-sm">
                            <span className={`font-black uppercase tracking-tight ${isChecked ? "line-through text-slate-400" : "text-white"}`}>
                              {t.fromName}
                            </span>
                            <span className="text-[#E8E1D5] font-bold text-xs uppercase opacity-75">이</span>
                            <span className={`font-black uppercase tracking-tight ${isChecked ? "line-through text-slate-400" : "text-[#E8E1D5]"}`}>
                              {t.toName}
                            </span>
                            <span className="text-[#E8E1D5] font-bold text-xs uppercase opacity-75">에게 보냄</span>
                          </div>

                          {/* 송금 금액 */}
                          <div className="flex items-center gap-3">
                            <span className={`font-mono text-base font-black ${
                              isChecked ? "line-through text-slate-400" : "text-[#E8E1D5]"
                            }`}>
                              {formatCurrency(t.amount)}
                            </span>
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                isChecked
                                  ? "bg-white border-white text-[#005A32]"
                                  : "border-white/50 text-transparent hover:border-white"
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* E. 여행 상세 지출 목록 카드 (High Density 테이블형 레코드 스타일) */}
            <div className="bg-white border-2 border-[#002D62] flex flex-col overflow-hidden shadow-[4px_4px_0px_#002D62]">
              <div className="bg-[#002D62] text-white p-3 flex justify-between px-4 items-center">
                <h2 className="font-bold text-sm tracking-widest uppercase flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-[#BA0C2F]" />
                  상세 지출 내역 기록
                </h2>
                <span className="font-mono text-xs opacity-80 bg-white/20 px-2 py-0.5">
                  TOTAL: {expenses.length} ITEMS
                </span>
              </div>

              {expenses.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm italic bg-slate-50">
                  기록된 지출 내역이 없습니다. 왼쪽 폼에서 지출 항목을 추가하세요.
                </div>
              ) : (
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-left font-mono text-sm border-collapse">
                    <thead className="bg-[#E8E1D5]/40 border-b-2 border-[#002D62] text-[#002D62] sticky top-0 z-10">
                      <tr>
                        <th className="p-3 text-xs font-black uppercase tracking-wider">날짜</th>
                        <th className="p-3 text-xs font-black uppercase tracking-wider">지출 항목</th>
                        <th className="p-3 text-xs font-black uppercase tracking-wider">지출자</th>
                        <th className="p-3 text-xs font-black uppercase tracking-wider text-right">금액</th>
                        <th className="p-3 text-xs font-black uppercase tracking-wider text-center">동작</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <AnimatePresence>
                        {expenses.map((expense) => {
                          const payer = participants.find((p) => p.id === expense.payerId);
                          const payerName = payer ? payer.name : "미확인";
                          const sharersCount = expense.participantIds.length;

                          return (
                            <motion.tr
                              key={expense.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="hover:bg-yellow-50/60 transition-colors"
                            >
                              <td className="p-3 text-slate-500 text-xs font-bold whitespace-nowrap">
                                {expense.date.substring(5)}
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-800">{expense.title}</div>
                                <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                                  분할인원: {sharersCount}명
                                </div>
                              </td>
                              <td className="p-3 font-sans font-bold text-[#002D62]">
                                {payerName}
                              </td>
                              <td className="p-3 text-right font-black text-slate-800 whitespace-nowrap">
                                {formatCurrency(expense.amount)}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExpense(expense.id)}
                                  className="text-slate-400 hover:text-[#BA0C2F] p-1.5 transition-colors"
                                  title="삭제"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ================= BOTTOM AREA: MEMBERS MANAGEMENT (자주 사용하지 않는 여행 친구 등록은 맨 아래로 내림) ================= */}
        <div className="border-t-4 border-dashed border-[#002D62]/20 pt-8 mt-4">
          <div className="bg-white border-2 border-[#002D62] p-5 shadow-[4px_4px_0px_#002D62] relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-[#002D62]">
              <div className="w-3 h-3 bg-[#BA0C2F] rounded-full" />
              <h2 className="font-black text-[#002D62] text-xl uppercase tracking-tight flex-1">
                여행 친구 등록
              </h2>
              <span className="font-mono text-[10px] text-slate-400 font-bold">MEMBERS</span>
            </div>

            {/* 참가자 추가 폼 */}
            <form onSubmit={handleAddParticipant} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="이름 입력 (예: 철수)"
                value={newParticipantName}
                onChange={(e) => setNewParticipantName(e.target.value)}
                maxLength={8}
                className="flex-1 border-2 border-[#002D62] p-2.5 rounded-none focus:outline-none focus:bg-yellow-50 text-slate-800 placeholder:text-slate-400 font-bold text-sm"
              />
              <button
                type="submit"
                className="bg-[#002D62] text-white font-black px-4 py-2.5 hover:bg-[#BA0C2F] transition-colors uppercase tracking-wider border-2 border-[#002D62] shrink-0 flex items-center gap-1 text-xs"
              >
                <UserPlus className="w-4 h-4" />
                추가
              </button>
            </form>

            {/* 현재 멤버 태그 리스트 */}
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
              {participants.length === 0 ? (
                <div className="text-center w-full py-4 text-xs text-slate-400 italic bg-slate-50 border border-dashed border-[#002D62]/30">
                  등록된 친구가 없습니다. 이름을 추가하세요.
                </div>
              ) : (
                <AnimatePresence>
                  {participants.map((p) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-1.5 bg-[#E8E1D5] text-[#002D62] text-xs font-black px-3 py-1.5 border-2 border-[#002D62] group hover:border-[#BA0C2F] hover:bg-red-50 transition-all cursor-default"
                    >
                      <span>{p.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(p.id)}
                        className="text-slate-400 hover:text-[#BA0C2F] transition-colors p-0.5 rounded"
                        title="제거"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>

      </main>

      {/* 3. 푸터 정보 */}
      <footer className="bg-white p-4 border-t-2 border-[#002D62] flex flex-col md:flex-row justify-center items-center gap-6 text-[11px] font-bold text-[#002D62] uppercase tracking-wider mt-12">
        <div className="flex items-center gap-1.5">
          <span>Items: {expenses.length}</span>
        </div>
        <div className="hidden md:block w-1.5 h-1.5 bg-[#BA0C2F] rounded-full" />
        <div className="flex items-center gap-1.5">
          <span>Members: {participants.length}</span>
        </div>
        <div className="hidden md:block w-1.5 h-1.5 bg-[#BA0C2F] rounded-full" />
        <div className="flex items-center gap-1.5">
          <span>Optimized Settlement Ground</span>
        </div>
      </footer>

      {/* 4. 커스텀 컨펌 모달 (iframe 내 정상 작동 보장) */}
      <AnimatePresence>
        {confirmModal?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 배경 블러 및 딤드 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(null)}
              className="absolute inset-0 bg-[#002D62]"
            />
            {/* 모달 박스 */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-4 border-[#002D62] shadow-[6px_6px_0px_#BA0C2F] p-6 max-w-sm w-full relative z-10"
            >
              <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-[#002D62]">
                <div className="w-3 h-3 bg-[#BA0C2F] rounded-full shrink-0" />
                <h4 className="font-black text-lg text-[#002D62] uppercase tracking-tight">
                  {confirmModal.title}
                </h4>
              </div>
              <p className="text-sm text-slate-700 font-bold mb-6 leading-relaxed">
                {confirmModal.message}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 border-2 border-[#002D62] text-[#002D62] font-bold text-xs hover:bg-[#E8E1D5] transition-colors uppercase tracking-wider"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={confirmModal.onConfirm}
                  className="px-4 py-2 bg-[#BA0C2F] text-white border-2 border-[#BA0C2F] hover:bg-red-700 font-bold text-xs transition-colors uppercase tracking-wider shadow-[2px_2px_0px_#002D62]"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. 커스텀 토스트 알림 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#002D62] text-white border-2 border-white shadow-[4px_4px_0px_#BA0C2F] px-5 py-3.5 max-w-sm font-bold text-xs tracking-wide"
          >
            <div className={`w-2.5 h-2.5 rounded-full ${
              toast.type === "error" ? "bg-red-500" : toast.type === "success" ? "bg-green-400" : "bg-blue-400"
            }`} />
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
