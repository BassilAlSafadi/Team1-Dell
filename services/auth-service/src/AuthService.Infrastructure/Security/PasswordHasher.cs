using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;

namespace AuthService.Infrastructure.Security;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);

    /// <summary>
    /// Performs the same Argon2id work as Verify and always returns false. Used on the
    /// no-such-account branch of login so that the response time doesn't reveal whether an email
    /// is registered.
    /// </summary>
    bool VerifyDummy(string password);
}

/// <summary>
/// Argon2id, encoded as salt:hash (both base64) so verification never needs a second parameter set.
/// </summary>
public class PasswordHasher : IPasswordHasher
{
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private const int DegreeOfParallelism = 4;
    private const int MemorySizeKb = 65536; // 64 MB
    private const int Iterations = 3;

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = ComputeHash(password, salt);
        return $"{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
    }

    // A fixed, well-formed hash to verify against when no account matched. Generated once at
    // startup so the dummy path costs exactly what a real verification costs.
    private static readonly string DummyHash = new PasswordHasher().Hash("dummy-password-for-timing-equalisation");

    public bool Verify(string password, string hash)
    {
        var parts = hash.Split(':', 2);
        if (parts.Length != 2)
        {
            return false;
        }

        // A malformed stored hash is corrupt data, not a crash: FromBase64String would otherwise
        // throw FormatException and surface as a 500 on an unauthenticated endpoint.
        byte[] salt;
        byte[] expected;
        try
        {
            salt = Convert.FromBase64String(parts[0]);
            expected = Convert.FromBase64String(parts[1]);
        }
        catch (FormatException)
        {
            return false;
        }

        var actual = ComputeHash(password, salt);

        return CryptographicOperations.FixedTimeEquals(expected, actual);
    }

    public bool VerifyDummy(string password)
    {
        Verify(password, DummyHash);
        return false;
    }

    private static byte[] ComputeHash(string password, byte[] salt)
    {
        using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(password))
        {
            Salt = salt,
            DegreeOfParallelism = DegreeOfParallelism,
            MemorySize = MemorySizeKb,
            Iterations = Iterations
        };

        return argon2.GetBytes(HashSize);
    }
}
