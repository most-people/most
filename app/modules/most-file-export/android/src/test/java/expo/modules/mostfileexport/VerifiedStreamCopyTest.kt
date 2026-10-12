package expo.modules.mostfileexport

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import org.junit.Assert.*
import org.junit.Test

class VerifiedStreamCopyTest {
  private class TrackedInput(bytes: ByteArray) : ByteArrayInputStream(bytes) {
    var closed = false
    var largestRead = 0
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
      largestRead = maxOf(largestRead, length)
      return super.read(buffer, offset, length)
    }
    override fun close() { closed = true; super.close() }
  }

  @Test fun copiesAndVerifiesWithBoundedReads() {
    val bytes = ByteArray(2 * 1024 * 1024 + 7) { (it % 251).toByte() }
    val source = TrackedInput(bytes)
    val output = ByteArrayOutputStream()
    val saved = TrackedInput(bytes)
    assertEquals(bytes.size.toLong(), VerifiedStreamCopy.copy({ source }, { output }, { saved }, bytes.size.toLong()))
    assertArrayEquals(bytes, output.toByteArray())
    assertTrue(source.closed)
    assertTrue(saved.closed)
    assertTrue(source.largestRead <= 64 * 1024)
    assertTrue(saved.largestRead <= 64 * 1024)
  }

  @Test fun acceptsEmptyFiles() {
    assertEquals(0L, VerifiedStreamCopy.copy(
      { ByteArrayInputStream(byteArrayOf()) }, { ByteArrayOutputStream() },
      { ByteArrayInputStream(byteArrayOf()) }, 0
    ))
  }

  @Test fun countsMoreThan2GiBWithoutAllocatingAWholeFile() {
    val size = 2L * 1024 * 1024 * 1024 + 17
    fun zeros() = object : InputStream() {
      var remaining = size
      override fun read(): Int = if (remaining-- > 0) 0 else -1
      override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (remaining == 0L) return -1
        val count = minOf(remaining, length.toLong()).toInt()
        buffer.fill(0, offset, offset + count)
        remaining -= count
        return count
      }
    }
    var written = 0L
    val sink = object : OutputStream() {
      override fun write(value: Int) { written++ }
      override fun write(buffer: ByteArray, offset: Int, length: Int) { written += length }
    }
    assertEquals(size, VerifiedStreamCopy.copy({ zeros() }, { sink }, { zeros() }, size))
    assertEquals(size, written)
  }

  @Test fun rejectsChangedSourceSize() {
    val source = TrackedInput(byteArrayOf(1, 2))
    assertThrows(IOException::class.java) {
      VerifiedStreamCopy.copy({ source }, { ByteArrayOutputStream() }, { error("must not verify") }, 3)
    }
    assertTrue(source.closed)
  }

  @Test fun rejectsCorruptionAtTheSameSize() {
    val saved = TrackedInput(byteArrayOf(1, 9))
    assertThrows(IOException::class.java) {
      VerifiedStreamCopy.copy({ ByteArrayInputStream(byteArrayOf(1, 2)) }, { ByteArrayOutputStream() }, { saved }, 2)
    }
    assertTrue(saved.closed)
  }

  @Test fun rejectsTruncatedDocuments() {
    assertThrows(IOException::class.java) {
      VerifiedStreamCopy.copy({ ByteArrayInputStream(byteArrayOf(1, 2)) }, { ByteArrayOutputStream() },
        { ByteArrayInputStream(byteArrayOf(1)) }, 2)
    }
  }

  @Test fun closesStreamsWhenTheProviderFailsWriting() {
    val source = TrackedInput(byteArrayOf(1, 2))
    var outputClosed = false
    val output = object : OutputStream() {
      override fun write(value: Int) { throw IOException("provider rejected write") }
      override fun close() { outputClosed = true }
    }
    assertThrows(IOException::class.java) {
      VerifiedStreamCopy.copy({ source }, { output }, { error("must not verify") }, 2)
    }
    assertTrue(source.closed)
    assertTrue(outputClosed)
  }
}
