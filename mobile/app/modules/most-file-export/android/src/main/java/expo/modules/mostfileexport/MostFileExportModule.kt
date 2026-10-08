package expo.modules.mostfileexport

import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MostFileExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MostFileExport")

    AsyncFunction("saveToDirectory") Coroutine {
        sourceUri: String, directoryUri: String, fileName: String, mimeType: String, expectedSize: Double ->
      withContext(Dispatchers.IO) {
        saveToDirectory(sourceUri, directoryUri, fileName, mimeType, expectedSize)
      }
    }
  }

  private fun saveToDirectory(
    sourceUri: String,
    directoryUri: String,
    fileName: String,
    mimeType: String,
    expectedSize: Double
  ): Map<String, Any> {
    val context = appContext.reactContext ?: throw IOException("Application context is unavailable")
    val source = Uri.parse(sourceUri)
    if (source.scheme != "file") throw IOException("Export source must be a local file")
    val sourceFile = File(source.path ?: throw IOException("Export source has no path")).canonicalFile
    val ownedRoots = listOf(context.filesDir.canonicalFile, context.cacheDir.canonicalFile)
    if (ownedRoots.none { sourceFile.path.startsWith(it.path + File.separator) }) {
      throw IOException("Export source is outside application storage")
    }
    if (!sourceFile.isFile || !expectedSize.isFinite() || expectedSize < 0 ||
      expectedSize != sourceFile.length().toDouble()) {
      throw IOException("Export source is missing or its size has changed")
    }
    if (fileName.isBlank() || fileName.any { it == '/' || it == '\\' || it.code < 32 }) {
      throw IOException("Invalid export file name")
    }

    val resolver = context.contentResolver
    val tree = Uri.parse(directoryUri)
    val directoryId = DocumentsContract.getTreeDocumentId(tree)
    val parent = DocumentsContract.buildDocumentUriUsingTree(tree, directoryId)
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, directoryId)
    val names = mutableSetOf<String>()
    resolver.query(children, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)
      ?.use { cursor ->
        while (cursor.moveToNext()) names.add(cursor.getString(0).lowercase(Locale.ROOT))
      } ?: throw IOException("Unable to read the selected directory")

    val dot = fileName.lastIndexOf('.').takeIf { it > 0 } ?: fileName.length
    var uniqueName = fileName
    var suffix = 1
    while (names.contains(uniqueName.lowercase(Locale.ROOT))) {
      uniqueName = "${fileName.substring(0, dot)} (${suffix++})${fileName.substring(dot)}"
    }
    val target = DocumentsContract.createDocument(resolver, parent, mimeType, uniqueName)
      ?: throw IOException("Unable to create the export document")
    try {
      val copied = VerifiedStreamCopy.copy(
        openSource = { sourceFile.inputStream() },
        openOutput = { resolver.openOutputStream(target, "wt") ?: throw IOException("Unable to write the export document") },
        openSaved = { resolver.openInputStream(target) ?: throw IOException("Unable to verify the export document") },
        expectedBytes = expectedSize.toLong()
      )
      val savedName = resolver.query(target, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null } ?: uniqueName
      return mapOf("uri" to target.toString(), "fileName" to savedName, "bytesCopied" to copied.toDouble())
    } catch (error: Exception) {
      val removed = runCatching { DocumentsContract.deleteDocument(resolver, target) }.getOrDefault(false)
      throw CodedException(
        if (removed) "ERR_EXPORT_FAILED" else "ERR_EXPORT_INCOMPLETE",
        if (removed) "File export failed" else "File export failed; an incomplete document may remain",
        error
      )
    }
  }
}
