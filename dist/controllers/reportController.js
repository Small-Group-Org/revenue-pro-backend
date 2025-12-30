export class ReportController {
    constructor(reportService) {
        this.reportService = reportService;
        this.get = async (req, res) => {
            try {
                const { timeframe, date } = req.query;
                if (typeof timeframe !== 'string' || !['weekly', 'monthly', 'yearly'].includes(timeframe)) {
                    res.status(400).json({ success: false, message: 'Invalid or missing timeframe.' });
                    return;
                }
                const reportData = await this.reportService.generate(timeframe, date);
                res.status(200).json({ success: true, data: reportData });
            }
            catch (error) {
                const statusCode = error.message.includes('found') ? 404 : 500;
                res.status(statusCode).json({ success: false, message: error.message });
            }
        };
    }
}
