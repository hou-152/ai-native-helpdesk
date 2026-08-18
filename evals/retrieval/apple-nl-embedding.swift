import Foundation
import NaturalLanguage

struct Document: Codable {
    let card_id: String
    let texts: [String]
}

struct Request: Codable {
    let queries: [String]
    let documents: [Document]
}

struct Response: Codable {
    let available: Bool
    let implementation: String
    let distance_conversion: String
    let reason: String?
    let rows: [[String: Double]]
}

func emit(_ response: Response) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    FileHandle.standardOutput.write(try encoder.encode(response))
}

do {
    let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
    guard let embedding = NLEmbedding.sentenceEmbedding(for: .simplifiedChinese) else {
        try emit(Response(
            available: false,
            implementation: "apple_nl_embedding_zh",
            distance_conversion: "similarity=max(0,min(1,1-distance))",
            reason: "SIMPLIFIED_CHINESE_SENTENCE_EMBEDDING_UNAVAILABLE",
            rows: []
        ))
        exit(0)
    }

    var rows: [[String: Double]] = []
    for query in request.queries {
        var row: [String: Double] = [:]
        for document in request.documents {
            var best = 0.0
            for text in document.texts {
                let distance = embedding.distance(between: query, and: text)
                let similarity = max(0.0, min(1.0, 1.0 - distance))
                if similarity > best { best = similarity }
            }
            row[document.card_id] = best
        }
        rows.append(row)
    }
    try emit(Response(
        available: true,
        implementation: "apple_nl_embedding_zh",
        distance_conversion: "similarity=max(0,min(1,1-distance))",
        reason: nil,
        rows: rows
    ))
} catch {
    FileHandle.standardError.write(Data("APPLE_NL_EMBEDDING_HELPER_ERROR\n".utf8))
    exit(65)
}
