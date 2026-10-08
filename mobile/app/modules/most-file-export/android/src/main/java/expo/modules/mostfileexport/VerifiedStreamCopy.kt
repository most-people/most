package expo.modules.mostfileexport

import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest

internal object VerifiedStreamCopy {
  private const val BUFFER_SIZE = 64 * 1024

  fun copy(
    openSource: () -> InputStream,
    openOutput: () -> OutputStream,
    openSaved: () -> InputStream,
    expectedBytes: Long
  ): Long {
    val buffer = ByteArray(BUFFER_SIZE)
    val sourceDigest = MessageDigest.getInstance("SHA-256")
    var copied = 0L
    openSource().use { source ->
      openOutput().use { output ->
        while (true) {
          val count = source.read(buffer)
          if (count == -1) break
          output.write(buffer, 0, count)
          sourceDigest.update(buffer, 0, count)
          copied += count
        }
        output.flush()
      }
    }
    if (copied != expectedBytes) throw IOException("Source file size changed during export")

    val savedDigest = MessageDigest.getInstance("SHA-256")
    var verified = 0L
    openSaved().use { saved ->
      while (true) {
        val count = saved.read(buffer)
        if (count == -1) break
        savedDigest.update(buffer, 0, count)
        verified += count
      }
    }
    if (verified != copied || !MessageDigest.isEqual(sourceDigest.digest(), savedDigest.digest())) {
      throw IOException("Saved document failed integrity verification")
    }
    return copied
  }
}
