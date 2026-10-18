import Foundation
import PDFKit
for path in CommandLine.arguments.dropFirst() {
 guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { continue }
 var text = ""
 for index in 0..<doc.pageCount { text += "\n--- PAGE \(index + 1) ---\n" + (doc.page(at: index)?.string ?? "") }
 try text.write(toFile: path + ".txt", atomically: true, encoding: .utf8)
 print(URL(fileURLWithPath: path).lastPathComponent, doc.pageCount, text.count)
}
