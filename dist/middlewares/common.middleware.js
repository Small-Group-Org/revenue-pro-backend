import { Context } from "../services/common/domain/context.js";
export function addContext(req, res, next) {
    req.context = new Context();
    next();
}
