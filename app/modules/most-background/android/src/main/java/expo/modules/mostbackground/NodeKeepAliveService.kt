package expo.modules.mostbackground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

// The running React client still owns the Bare Worklet. This service holds
// process importance and CPU availability; it never creates a second node.
class NodeKeepAliveService : Service() {
  companion object {
    @Volatile var running = false
      private set
    var observer: ((Boolean) -> Unit)? = null
    private const val CHANNEL = "mostbox-background-transfer"
    private const val NOTIFICATION_ID = 1976
    private const val STOP = "stop-background-transfer"
    private const val MAX_DURATION = 6 * 60 * 60 * 1000L
  }
  private val handler = Handler(Looper.getMainLooper())
  private var wakeLock: PowerManager.WakeLock? = null
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null || intent.action == STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (running) return START_NOT_STICKY
    try {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(NotificationChannel(CHANNEL, intent.getStringExtra("title"), NotificationManager.IMPORTANCE_LOW))
      val stop = PendingIntent.getService(this, 0, Intent(this, javaClass).setAction(STOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val open = packageManager.getLaunchIntentForPackage(packageName)
      val notification = Notification.Builder(this, CHANNEL)
        .setSmallIcon(applicationInfo.icon)
        .setContentTitle(intent.getStringExtra("title"))
        .setContentText(intent.getStringExtra("body"))
        .setOngoing(true).setOnlyAlertOnce(true)
        .addAction(Notification.Action.Builder(null, intent.getStringExtra("stopLabel"), stop).build())
      if (open != null) notification.setContentIntent(PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      else startForeground(NOTIFICATION_ID, notification.build())
      wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:transfer").apply { acquire(MAX_DURATION) }
      running = true
      observer?.invoke(true)
      handler.postDelayed({ stopSelf() }, MAX_DURATION)
    } catch (_: Exception) {
      stopSelf()
    }
    return START_NOT_STICKY
  }
  override fun onTimeout(startId: Int, fgsType: Int) { stopSelf() }
  override fun onTaskRemoved(rootIntent: Intent?) { stopSelf() }
  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    running = false
    observer?.invoke(false)
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
