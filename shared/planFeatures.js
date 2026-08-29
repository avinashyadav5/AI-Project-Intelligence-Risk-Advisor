const PLAN_LIMITS = {
  starter: {
    maxProjects: 3,
    advancedAIAnalysis: false,
    traceabilityMatrix: false,
    exportFormats: ['pdf'],
    support: 'community'
  },
  professional: {
    maxProjects: Infinity,
    advancedAIAnalysis: true,
    traceabilityMatrix: true,
    exportFormats: ['pdf'],
    support: 'priority_email'
  },
  enterprise: {
    maxProjects: Infinity,
    advancedAIAnalysis: true,
    traceabilityMatrix: true,
    exportFormats: ['pdf'],
    support: 'dedicated_account_manager',
    customAIModels: true,
    sso: true
  }
};

module.exports = { PLAN_LIMITS };
