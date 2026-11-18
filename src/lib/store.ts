import type { Store, Term } from "@/types";

const KEY = "kotoba-store-v1";

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const now = Date.now();
function seed(ja: string, kana: string, zh: string, category: string, note = ""): Term {
  return { id: uid(), zh, ja, kana, category, note, createdAt: now, updatedAt: now };
}

const SEED: Store = {
  categories: ["商务", "IT・开发", "法律・合同", "制造・品质", "日常事务"],
  terms: [
    seed("見積書", "みつもりしょ", "报价单", "商务", "也常说「お見積り」"),
    seed("納期", "のうき", "交期 / 交付日期", "商务"),
    seed("請求書", "せいきゅうしょ", "账单 / 发票（请款书）", "商务", "税务发票另称「適格請求書」"),
    seed("稟議書", "りんぎしょ", "内部审批申请单", "商务", "日式企业盖章流转的审批文件"),
    seed("取引先", "とりひきさき", "客户 / 往来单位", "商务"),
    seed("仕様書", "しようしょ", "规格书 / 需求说明书", "IT・开发"),
    seed("結合試験", "けつごうしけん", "集成测试", "IT・开发", "单测=単体試験"),
    seed("本番環境", "ほんばんかんきょう", "生产环境", "IT・开发", "测试环境=検証環境"),
    seed("改修", "かいしゅう", "修改 / 修复（既有功能）", "IT・开发"),
    seed("秘密保持契約", "ひみつほじけいやく", "保密协议（NDA）", "法律・合同", "口语直接说 NDA"),
    seed("瑕疵担保責任", "かしたんぽせきにん", "瑕疵担保责任", "法律・合同", "2020年民法改正后改为「契約不適合責任」"),
    seed("検収", "けんしゅう", "验收", "法律・合同"),
    seed("不具合", "ふぐあい", "缺陷 / 不良", "制造・品质", "比「バグ」更正式"),
    seed("歩留まり", "ぶどまり", "良率 / 成品率", "制造・品质"),
    seed("段取り", "だんどり", "流程安排 / 准备工作", "日常事务"),
    seed("擦り合わせ", "すりあわせ", "对齐 / 磨合（意见、规格）", "日常事务"),
  ],
};

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      saveStore(SEED);
      return SEED;
    }
    const data = JSON.parse(raw) as Store;
    if (!Array.isArray(data.terms) || !Array.isArray(data.categories)) throw new Error("bad shape");
    return data;
  } catch {
    return SEED;
  }
}

export function saveStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}
