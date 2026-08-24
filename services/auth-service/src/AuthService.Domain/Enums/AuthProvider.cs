namespace AuthService.Domain.Enums;

public enum AuthProvider
{
    Local,
    Google,
    Apple,
    Microsoft
}

public static class AuthProviderExtensions
{
    public static string ToDbValue(this AuthProvider provider) => provider switch
    {
        AuthProvider.Local => "LOCAL",
        AuthProvider.Google => "GOOGLE",
        AuthProvider.Apple => "APPLE",
        AuthProvider.Microsoft => "MICROSOFT",
        _ => throw new ArgumentOutOfRangeException(nameof(provider), provider, null)
    };

    public static AuthProvider FromDbValue(string value) => value switch
    {
        "LOCAL" => AuthProvider.Local,
        "GOOGLE" => AuthProvider.Google,
        "APPLE" => AuthProvider.Apple,
        "MICROSOFT" => AuthProvider.Microsoft,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, null)
    };
}
