export interface Term {
  id: string;
  zh: string; // 中文
  ja: string; // 日文
  kana: string; // 假名 / 读音
  category: string; // 分类
  note: string; // 备注
  createdAt: number;
  updatedAt: number;
}

export interface Store {
  terms: Term[];
  categories: string[];
}

export const EMPTY_TERM: Omit<Term, "id" | "createdAt" | "updatedAt"> = {
  zh: "",
  ja: "",
  kana: "",
  category: "",
  note: "",
};
