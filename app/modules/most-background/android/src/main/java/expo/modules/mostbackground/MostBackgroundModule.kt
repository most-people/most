package expo.modules.mostbackground

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.delay

class MostBackgroundModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MostBackground")
    Events("change")
    OnCreate { NodeKeepAliveService.observer = { sendEvent("change", mapOf("running" to it)) } }
    OnDestroy { NodeKeepAliveService.observer = null }
    Function("isRunning") { NodeKeepAliveService.running }
    AsyncFunction("start") Coroutine { title: String, body: String, stopLabel: String ->
      val context = appContext.reactContext ?: error("Application is unavailable")
      val activity = appContext.currentActivity ?: error("Open the app before starting")
      check(activity.hasWindowFocus()) { "Open the app before starting" }
      context.startForegroundService(Intent(context, NodeKeepAliveService::class.java)
        .putExtra("title", title).putExtra("body", body).putExtra("stopLabel", stopLabel))
      var attempts = 0
      while (!NodeKeepAliveService.running && attempts++ < 20) delay(100)
      check(NodeKeepAliveService.running) { "Foreground service did not start" }
    }
    AsyncFunction("stop") {
      appContext.reactContext?.stopService(Intent(appContext.reactContext, NodeKeepAliveService::class.java))
    }
  }
}
