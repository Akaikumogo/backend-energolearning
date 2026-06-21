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
}

export class HomeOverviewDto {
  scopeLabel!: string;
  branchHeatmap!: HomeBranchHeatmapRowDto[];
  mostActiveBranch!: HomeBranchRankDto | null;
  topErrorBranches!: HomeBranchRankDto[];
}
