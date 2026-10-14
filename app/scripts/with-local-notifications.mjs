import configPlugins from 'expo/config-plugins.js'

const { withEntitlementsPlist } = configPlugins

// Local channel reminders do not register with APNs or require its entitlement.
export default function withLocalNotifications(config) {
  return withEntitlementsPlist(config, next => {
    delete next.modResults['aps-environment']
    return next
  })
}
