import type { Inquiry } from '../domain/inquiry.js';

/** 문의별 답변 근거를 찾아오는 지식 소스 경계입니다. */
export interface ContextProvider {
  /** 문의 내용을 기준으로 AI 초안에 넣을 관련 근거 문장을 반환합니다. */
  findRelevantContext(inquiry: Inquiry): Promise<string[]>;
}

/** DB/vector store가 붙기 전까지 사용할 고정 context provider입니다. */
export class StaticContextProvider implements ContextProvider {
  constructor(private readonly entries: string[] = []) {}

  /** 모든 문의에 동일한 정적 근거를 반환합니다. */
  async findRelevantContext(_inquiry: Inquiry): Promise<string[]> {
    return this.entries;
  }
}
