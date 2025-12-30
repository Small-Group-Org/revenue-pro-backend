export class Context {
    setUserId(userId) {
        this.userId = userId;
    }
    getUserId() {
        return this.userId;
    }
    setOrgId(orgId) {
        this.orgId = orgId;
    }
    getOrgId() {
        return this.orgId;
    }
    setUser(user) {
        this.currentUser = user;
    }
    getUser() {
        return this.currentUser;
    }
}
