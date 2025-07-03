export class Context {
  private userId!: string;
  private orgId!: string;

  public setUserId(userId: string): void {
    this.userId = userId;
  }

  public getUserId(): string {
    return this.userId;
  }

  public setOrgId(orgId: string): void {
    this.orgId = orgId;
  }

  public getOrgId(): string {
    return this.orgId;
  }
}
