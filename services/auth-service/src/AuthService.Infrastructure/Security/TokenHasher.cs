using System.Security.Cryptography;
using System.Text;

namespace AuthService.Infrastructure.Security;

public interface ITokenHasher
{
    /// <summary>Generates a URL-safe random token and returns (rawToken, hashToStore).</summary>
    (string RawToken, string Hash) GenerateToken(int byteLength = 32);

    /// <summary>Generates a short numeric code (for email verification) and returns (rawCode, hashToStore).</summary>
    (string RawCode, string Hash) GenerateNumericCode(int length);

    string Hash(string rawValue);
}

/// <summary>
/// SHA-256 is sufficient here: refresh tokens, reset tokens and verification codes are
/// already high-entropy random values, not user-chosen secrets, so a fast hash is fine
/// and lets us look them up by exact match instead of scanning with a slow KDF.
/// </summary>
public class TokenHasher : ITokenHasher
{
    public (string RawToken, string Hash) GenerateToken(int byteLength = 32)
    {
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(byteLength))
            .Replace("+", "-").Replace("/", "_").Replace("=", "");
        return (raw, Hash(raw));
    }

    public (string RawCode, string Hash) GenerateNumericCode(int length)
    {
        var max = (int)Math.Pow(10, length);
        var code = RandomNumberGenerator.GetInt32(0, max).ToString().PadLeft(length, '0');
        return (code, Hash(code));
    }

    public string Hash(string rawValue)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawValue));
        return Convert.ToHexString(bytes);
    }
}
