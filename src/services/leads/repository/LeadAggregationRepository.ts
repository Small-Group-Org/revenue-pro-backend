import LeadModel from './models/leads.model.js';
import { ILead } from '../domain/leads.domain.js';
import { ILeadAggregationRepository } from './interfaces.js';

export class LeadAggregationRepository implements ILeadAggregationRepository {
  
  // Helper method to add soft delete filter consistently
  private addSoftDeleteFilter(query: any): any {
    return { ...query, isDeleted: false };
  }

  // Pagination and filtering
  async findLeadsWithCount(options: {
    query?: Partial<ILead>;
    sortField?: string;
    sortOrder?: 1 | -1;
    skip?: number;
    limit?: number;
  }): Promise<{ totalCount: number; leads: Partial<ILead>[] }> {
    const {
      query = {},
      sortField = '_id',
      sortOrder = 1,
      skip = 0,
      limit = 10
    } = options;

    const finalQuery = this.addSoftDeleteFilter(query);

    const [totalCount, leads] = await Promise.all([
      LeadModel.countDocuments(finalQuery).exec(),
      LeadModel.find(finalQuery)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec()
    ]);

    return { totalCount, leads };
  }

  // Filter options and statistics
  async getLeadFilterOptionsAndStats(query: any): Promise<{
    services: string[];
    adSetNames: string[];
    adNames: string[];
    statuses: string[];
    unqualifiedLeadReasons: string[];
    statusAgg: { _id: string; count: number }[];
  }> {
    const finalQuery = this.addSoftDeleteFilter(query);
    const unqualifiedQuery = { ...finalQuery, status: "unqualified" };

    const [services, adSetNames, adNames, statuses, unqualifiedLeadReasons, statusAgg] =
      await Promise.all([
        LeadModel.distinct("service", finalQuery).exec(),
        LeadModel.distinct("adSetName", finalQuery).exec(),
        LeadModel.distinct("adName", finalQuery).exec(),
        LeadModel.distinct("status", finalQuery).exec(),
        LeadModel.distinct("unqualifiedLeadReason", unqualifiedQuery).exec(),
        LeadModel.aggregate([
          { $match: finalQuery },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 }
            }
          }
        ]).exec()
      ]);

    return { services, adSetNames, adNames, statuses, unqualifiedLeadReasons, statusAgg };
  }

  // Performance analytics - Ad Set Performance
  async getAdSetPerformance(
    query: any, 
    page: number, 
    limit: number, 
    sortOptions?: any
  ): Promise<{ totalCount: number; data: any[] }> {
    
    const finalQuery = this.addSoftDeleteFilter(query);
    
    const pipeline: any[] = [
      { $match: finalQuery },
      {
        $group: {
          _id: '$adSetName',
          total: { $sum: 1 },
          estimateSet: {
            $sum: { $cond: [{ $eq: ['$status', 'estimate_set'] }, 1, 0] }
          },
          virtualQuote: {
            $sum: { $cond: [{ $eq: ['$status', 'virtual_quote'] }, 1, 0] }
          },
          proposalPresented: {
            $sum: { $cond: [{ $eq: ['$status', 'proposal_presented'] }, 1, 0] }
          },
          jobBooked: {
            $sum: { $cond: [{ $eq: ['$status', 'job_booked'] }, 1, 0] }
          },
          unqualified: {
            $sum: { $cond: [{ $eq: ['$status', 'unqualified'] }, 1, 0] }
          },
          estimateCanceled: {
            $sum: { $cond: [{ $eq: ['$status', 'estimate_canceled'] }, 1, 0] }
          },
          jobLost: {
            $sum: { $cond: [{ $eq: ['$status', 'job_lost'] }, 1, 0] }
          },
          totalJobBookedAmount: {
            $sum: { $cond: [{ $gt: ['$jobBookedAmount', 0] }, '$jobBookedAmount', 0] }
          },
          totalProposalAmount: {
            $sum: { $cond: [{ $gt: ['$proposalAmount', 0] }, '$proposalAmount', 0] }
          }
        }
      },
      {
        $project: {
          adSetName: '$_id',
          totalLeads: '$total',
          estimateSet: 1,
          unqualified: 1,
          jobBookedAmount: { $round: ['$totalJobBookedAmount', 2] },
          proposalAmount: { $round: ['$totalProposalAmount', 2] },
          percentage: {
            $let: {
              vars: {
                netEstimates: { $add: ['$estimateSet', '$virtualQuote', '$proposalPresented', '$jobBooked'] },
                netUnqualifieds: { $add: ['$unqualified', '$estimateCanceled', '$jobLost'] }
              },
              in: {
                $cond: [
                  { $gt: [ { $add: ['$$netEstimates', '$$netUnqualifieds'] }, 0 ] },
                  { $multiply: [
                    { $divide: ['$$netEstimates', { $add: ['$$netEstimates', '$$netUnqualifieds'] }] },
                    100
                  ] },
                  0
                ]
              }
            }
          },
          _id: 0
        }
      }
    ];

    // Add sorting
    if (sortOptions?.showTopRanked) {
      pipeline.push({ $sort: { percentage: -1, estimateSet: -1 } });
    } else if (sortOptions?.adSetSortField) {
      const sortField = sortOptions.adSetSortField === 'percentage'
        ? 'percentage'
        : sortOptions.adSetSortField === 'total'
          ? 'totalLeads'
          : sortOptions.adSetSortField;

      const sortOrder: 1 | -1 = sortOptions.adSetSortOrder === 'asc' ? 1 : -1;
      pipeline.push({ $sort: { [sortField]: sortOrder } });
    }

    // Define the pagination stages
    const skip = (page - 1) * limit;
    const paginationPipeline: any[] = [
      { $skip: skip },
      { $limit: limit }
    ];

    // Run the aggregation with $facet to get both total count and paginated data in one call
    const result = await LeadModel.aggregate([
      {
        $facet: {
          totalCount: [
            ...pipeline,
            { $count: 'total' }
          ],
          data: [
            ...pipeline,
            ...paginationPipeline
          ]
        }
      }
    ]);

    // Extract and format results
    const totalCount = result[0].totalCount[0]?.total || 0;
    const data = result[0].data || [];
    
    return { totalCount, data };
  }

  // Performance analytics - Ad Name Performance
  async getAdNamePerformance(
    query: any, 
    page: number, 
    limit: number, 
    sortOptions?: any
  ): Promise<{ totalCount: number; data: any[] }> {
    
    const finalQuery = this.addSoftDeleteFilter(query);
    
    const pipeline: any[] = [
      { $match: finalQuery },
      {
        $group: {
          _id: { adName: '$adName', adSetName: '$adSetName' },
          total: { $sum: 1 },
          estimateSet: {
            $sum: { $cond: [{ $eq: ['$status', 'estimate_set'] }, 1, 0] }
          },
          virtualQuote: {
            $sum: { $cond: [{ $eq: ['$status', 'virtual_quote'] }, 1, 0] }
          },
          proposalPresented: {
            $sum: { $cond: [{ $eq: ['$status', 'proposal_presented'] }, 1, 0] }
          },
          jobBooked: {
            $sum: { $cond: [{ $eq: ['$status', 'job_booked'] }, 1, 0] }
          },
          unqualified: {
            $sum: { $cond: [{ $eq: ['$status', 'unqualified'] }, 1, 0] }
          },
          estimateCanceled: {
            $sum: { $cond: [{ $eq: ['$status', 'estimate_canceled'] }, 1, 0] }
          },
          jobLost: {
            $sum: { $cond: [{ $eq: ['$status', 'job_lost'] }, 1, 0] }
          },
          totalJobBookedAmount: {
            $sum: { $cond: [{ $gt: ['$jobBookedAmount', 0] }, '$jobBookedAmount', 0] }
          },
          totalProposalAmount: {
            $sum: { $cond: [{ $gt: ['$proposalAmount', 0] }, '$proposalAmount', 0] }
          }
        }
      },
      {
        $project: {
          adName: '$_id.adName',
          adSetName: '$_id.adSetName',
          totalLeads: '$total',
          estimateSet: 1,
          unqualified: 1,
          jobBookedAmount: { $round: ['$totalJobBookedAmount', 2] },
          proposalAmount: { $round: ['$totalProposalAmount', 2] },
          percentage: {
            $let: {
              vars: {
                netEstimates: { $add: ['$estimateSet', '$virtualQuote', '$proposalPresented', '$jobBooked'] },
                netUnqualifieds: { $add: ['$unqualified', '$estimateCanceled', '$jobLost'] }
              },
              in: {
                $cond: [
                  { $gt: [ { $add: ['$$netEstimates', '$$netUnqualifieds'] }, 0 ] },
                  { $multiply: [
                    { $divide: ['$$netEstimates', { $add: ['$$netEstimates', '$$netUnqualifieds'] }] },
                    100
                  ] },
                  0
                ]
              }
            }
          },
          _id: 0
        }
      }
    ];

    // Add sorting
    if (sortOptions?.showTopRanked) {
      pipeline.push({ $sort: { percentage: -1, estimateSet: -1 } });
    } else if (sortOptions?.adNameSortField) {
      const sortField = sortOptions.adNameSortField === 'percentage' ? 'percentage'
        : sortOptions.adNameSortField === 'total'
          ? 'totalLeads'
          : sortOptions.adNameSortField;
      const sortOrder: 1 | -1 = sortOptions.adNameSortOrder === 'asc' ? 1 : -1;
      pipeline.push({ $sort: { [sortField]: sortOrder } });
    }

    // Define the pagination stages
    const skip = (page - 1) * limit;
    const paginationPipeline: any[] = [
      { $skip: skip },
      { $limit: limit }
    ];

    // Run the aggregation with $facet to get both total count and paginated data in one call
    const result = await LeadModel.aggregate([
      {
        $facet: {
          totalCount: [
            ...pipeline,
            { $count: 'total' }
          ],
          data: [
            ...pipeline,
            ...paginationPipeline
          ]
        }
      }
    ]);

    // Extract and format results
    const totalCount = result[0].totalCount[0]?.total || 0;
    const data = result[0].data || [];
    
    return { totalCount, data };
  }
}

// Export singleton instance
export const leadAggregationRepository = new LeadAggregationRepository();
