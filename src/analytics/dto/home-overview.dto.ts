export class HomeBranchWeekDto {
  weekStart!: string;
  count!: number;
}

export class HomeBranchHeatmapRowDto {
  orgId!: string;
  orgName!: string;
  isDefault!: boolean;
  weeks!: HomeBranchWeekDto[];
  totalLogins!: number;
}

export class HomeBranchRankDto {
  orgId!: string;
  orgName!: string;
  isDefault!: boolean;
  value!: number;
  /** Oldingi davr (taqqoslash uchun), ixtiyoriy */
  previousValue?: number | null;
}

export class HomeInsightDto {
  loginsThisWeek!: number;
  loginsPrevWeek!: number;
  loginDeltaPercent!: number | null;
  errors30d!: number;
  errorsPrev30d!: number;
  errorDeltaPercent!: number | null;
  onlineHint!: number;
}

export class HomeOverviewDto {
  scopeLabel!: string;
  branchHeatmap!: HomeBranchHeatmapRowDto[];
  mostActiveBranch!: HomeBranchRankDto | null;
  topErrorBranches!: HomeBranchRankDto[];
  insight!: HomeInsightDto;
}
