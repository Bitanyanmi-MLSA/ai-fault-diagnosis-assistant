@description('Name of the Azure AI Services (Foundry) account')
param name string

@description('Primary location for the AI Services account')
param location string = resourceGroup().location

param tags object = {}

@description('Principal ID of the Function App managed identity to grant OpenAI access')
param functionAppPrincipalId string

@description('Principal ID of the interactive user/dev identity for local testing (optional)')
param userIdentityPrincipalId string = ''

@description('Name of the gpt-4o model deployment')
param gptDeploymentName string = 'gpt-4o'

@description('gpt-4o model version to deploy')
param gptModelVersion string = '2024-11-20'

@description('Deployment SKU - GlobalStandard spreads load across regions for better throughput/cost')
param deploymentSkuName string = 'GlobalStandard'

@description('Tokens-per-minute capacity (in units of 1,000 TPM)')
param deploymentCapacity int = 10

// Role: Cognitive Services OpenAI User - lets the identity call chat/vision completions, no key access
var cognitiveServicesOpenAIUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource aiServices 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'S0'
  }
  kind: 'AIServices'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
}

resource gptDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: aiServices
  name: gptDeploymentName
  sku: {
    name: deploymentSkuName
    capacity: deploymentCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: gptModelVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
}

resource openAiRoleFunctionApp 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, functionAppPrincipalId, cognitiveServicesOpenAIUserRoleId)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource openAiRoleUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(userIdentityPrincipalId)) {
  name: guid(aiServices.id, userIdentityPrincipalId, cognitiveServicesOpenAIUserRoleId)
  scope: aiServices
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAIUserRoleId)
    principalId: userIdentityPrincipalId
    principalType: 'User'
  }
}

output endpoint string = aiServices.properties.endpoint
output name string = aiServices.name
output gptDeploymentName string = gptDeployment.name
