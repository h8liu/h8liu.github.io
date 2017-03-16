var dag = {
    "h": 56,
    "w": 16,
    "n": {
        "archive/tar": {
            "n": "archive/tar",
            "x": 12,
            "y": 14,
            "i": [
                "fmt",
                "io/ioutil",
                "path"
            ],
            "o": []
        },
        "archive/zip": {
            "n": "archive/zip",
            "x": 12,
            "y": 32,
            "i": [
                "compress/flate",
                "encoding/binary",
                "hash/crc32",
                "io/ioutil",
                "path"
            ],
            "o": []
        },
        "bufio": {
            "n": "bufio",
            "x": 8,
            "y": 40,
            "i": [
                "bytes"
            ],
            "o": [
                "compress/bzip2",
                "compress/flate",
                "compress/lzw",
                "crypto/rand",
                "encoding/csv",
                "encoding/gob",
                "encoding/xml",
                "go/build",
                "image",
                "internal/trace",
                "mime",
                "mime/quotedprintable",
                "net/http/internal",
                "net/textproto",
                "runtime/pprof"
            ]
        },
        "bytes": {
            "n": "bytes",
            "x": 7,
            "y": 31,
            "i": [
                "io",
                "unicode",
                "unicode/utf8"
            ],
            "o": [
                "bufio",
                "debug/gosym",
                "debug/macho",
                "encoding/base32",
                "encoding/hex",
                "encoding/json",
                "encoding/pem",
                "go/scanner",
                "io/ioutil",
                "math/big",
                "net/url",
                "os/exec",
                "regexp/syntax",
                "text/scanner",
                "text/tabwriter",
                "text/template/parse"
            ]
        },
        "compress/bzip2": {
            "n": "compress/bzip2",
            "x": 9,
            "y": 17,
            "i": [
                "bufio",
                "sort"
            ],
            "o": []
        },
        "compress/flate": {
            "n": "compress/flate",
            "x": 11,
            "y": 22,
            "i": [
                "bufio",
                "fmt",
                "sort"
            ],
            "o": [
                "archive/zip",
                "compress/gzip",
                "compress/zlib"
            ]
        },
        "compress/gzip": {
            "n": "compress/gzip",
            "x": 12,
            "y": 42,
            "i": [
                "compress/flate",
                "encoding/binary",
                "hash/crc32"
            ],
            "o": [
                "net/http"
            ]
        },
        "compress/lzw": {
            "n": "compress/lzw",
            "x": 9,
            "y": 39,
            "i": [
                "bufio",
                "fmt"
            ],
            "o": [
                "image/gif"
            ]
        },
        "compress/zlib": {
            "n": "compress/zlib",
            "x": 12,
            "y": 44,
            "i": [
                "compress/flate",
                "hash/adler32"
            ],
            "o": [
                "debug/elf",
                "image/png"
            ]
        },
        "container/heap": {
            "n": "container/heap",
            "x": 12,
            "y": 2,
            "i": [
                "sort"
            ],
            "o": [
                "go/types"
            ]
        },
        "container/list": {
            "n": "container/list",
            "x": 11,
            "y": 5,
            "i": [],
            "o": [
                "crypto/tls"
            ]
        },
        "container/ring": {
            "n": "container/ring",
            "x": 0,
            "y": 29,
            "i": [],
            "o": []
        },
        "context": {
            "n": "context",
            "x": 9,
            "y": 13,
            "i": [
                "fmt"
            ],
            "o": [
                "net",
                "os/exec"
            ]
        },
        "crypto": {
            "n": "crypto",
            "x": 8,
            "y": 36,
            "i": [
                "hash",
                "strconv"
            ],
            "o": [
                "crypto/md5",
                "crypto/rsa",
                "crypto/sha1",
                "crypto/sha256",
                "crypto/sha512"
            ]
        },
        "crypto/aes": {
            "n": "crypto/aes",
            "x": 8,
            "y": 20,
            "i": [
                "crypto/cipher",
                "strconv"
            ],
            "o": [
                "crypto/ecdsa",
                "crypto/rand"
            ]
        },
        "crypto/cipher": {
            "n": "crypto/cipher",
            "x": 7,
            "y": 21,
            "i": [
                "crypto/subtle",
                "io"
            ],
            "o": [
                "crypto/aes",
                "crypto/des"
            ]
        },
        "crypto/des": {
            "n": "crypto/des",
            "x": 10,
            "y": 11,
            "i": [
                "crypto/cipher",
                "encoding/binary"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "crypto/dsa": {
            "n": "crypto/dsa",
            "x": 10,
            "y": 47,
            "i": [
                "math/big"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "crypto/ecdsa": {
            "n": "crypto/ecdsa",
            "x": 10,
            "y": 38,
            "i": [
                "crypto/aes",
                "crypto/elliptic",
                "crypto/sha512",
                "encoding/asn1"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "crypto/elliptic": {
            "n": "crypto/elliptic",
            "x": 9,
            "y": 43,
            "i": [
                "math/big"
            ],
            "o": [
                "crypto/ecdsa"
            ]
        },
        "crypto/hmac": {
            "n": "crypto/hmac",
            "x": 11,
            "y": 17,
            "i": [
                "crypto/subtle",
                "hash"
            ],
            "o": [
                "crypto/tls"
            ]
        },
        "crypto/md5": {
            "n": "crypto/md5",
            "x": 10,
            "y": 49,
            "i": [
                "crypto"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "crypto/rand": {
            "n": "crypto/rand",
            "x": 9,
            "y": 34,
            "i": [
                "bufio",
                "crypto/aes",
                "math/big"
            ],
            "o": [
                "crypto/rsa",
                "mime/multipart"
            ]
        },
        "crypto/rc4": {
            "n": "crypto/rc4",
            "x": 11,
            "y": 9,
            "i": [
                "strconv"
            ],
            "o": [
                "crypto/tls"
            ]
        },
        "crypto/rsa": {
            "n": "crypto/rsa",
            "x": 10,
            "y": 43,
            "i": [
                "crypto",
                "crypto/rand"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "crypto/sha1": {
            "n": "crypto/sha1",
            "x": 10,
            "y": 51,
            "i": [
                "crypto"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "crypto/sha256": {
            "n": "crypto/sha256",
            "x": 10,
            "y": 53,
            "i": [
                "crypto"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "crypto/sha512": {
            "n": "crypto/sha512",
            "x": 9,
            "y": 45,
            "i": [
                "crypto"
            ],
            "o": [
                "crypto/ecdsa"
            ]
        },
        "crypto/subtle": {
            "n": "crypto/subtle",
            "x": 6,
            "y": 22,
            "i": [],
            "o": [
                "crypto/cipher",
                "crypto/hmac"
            ]
        },
        "crypto/tls": {
            "n": "crypto/tls",
            "x": 12,
            "y": 17,
            "i": [
                "container/list",
                "crypto/hmac",
                "crypto/rc4",
                "crypto/x509"
            ],
            "o": [
                "net/http",
                "net/smtp"
            ]
        },
        "crypto/x509": {
            "n": "crypto/x509",
            "x": 11,
            "y": 38,
            "i": [
                "crypto/des",
                "crypto/dsa",
                "crypto/ecdsa",
                "crypto/md5",
                "crypto/rsa",
                "crypto/sha1",
                "crypto/sha256",
                "crypto/x509/pkix",
                "encoding/hex",
                "encoding/pem",
                "io/ioutil",
                "net",
                "os/exec"
            ],
            "o": [
                "crypto/tls"
            ]
        },
        "crypto/x509/pkix": {
            "n": "crypto/x509/pkix",
            "x": 10,
            "y": 55,
            "i": [
                "encoding/asn1"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "database/sql": {
            "n": "database/sql",
            "x": 9,
            "y": 15,
            "i": [
                "database/sql/driver",
                "sort"
            ],
            "o": []
        },
        "database/sql/driver": {
            "n": "database/sql/driver",
            "x": 8,
            "y": 16,
            "i": [
                "fmt"
            ],
            "o": [
                "database/sql"
            ]
        },
        "debug/dwarf": {
            "n": "debug/dwarf",
            "x": 12,
            "y": 19,
            "i": [
                "encoding/binary",
                "fmt",
                "path",
                "sort"
            ],
            "o": [
                "debug/elf",
                "debug/macho",
                "debug/pe"
            ]
        },
        "debug/elf": {
            "n": "debug/elf",
            "x": 13,
            "y": 34,
            "i": [
                "compress/zlib",
                "debug/dwarf"
            ],
            "o": [
                "go/internal/gccgoimporter"
            ]
        },
        "debug/gosym": {
            "n": "debug/gosym",
            "x": 8,
            "y": 24,
            "i": [
                "bytes",
                "encoding/binary",
                "fmt",
                "strings"
            ],
            "o": []
        },
        "debug/macho": {
            "n": "debug/macho",
            "x": 13,
            "y": 12,
            "i": [
                "bytes",
                "debug/dwarf"
            ],
            "o": []
        },
        "debug/pe": {
            "n": "debug/pe",
            "x": 13,
            "y": 9,
            "i": [
                "debug/dwarf"
            ],
            "o": []
        },
        "debug/plan9obj": {
            "n": "debug/plan9obj",
            "x": 8,
            "y": 18,
            "i": [
                "encoding/binary",
                "fmt"
            ],
            "o": []
        },
        "encoding": {
            "n": "encoding",
            "x": 11,
            "y": 7,
            "i": [],
            "o": [
                "encoding/gob",
                "encoding/json",
                "encoding/xml"
            ]
        },
        "encoding/ascii85": {
            "n": "encoding/ascii85",
            "x": 6,
            "y": 31,
            "i": [
                "io",
                "strconv"
            ],
            "o": []
        },
        "encoding/asn1": {
            "n": "encoding/asn1",
            "x": 9,
            "y": 41,
            "i": [
                "math/big"
            ],
            "o": [
                "crypto/ecdsa",
                "crypto/x509/pkix"
            ]
        },
        "encoding/base32": {
            "n": "encoding/base32",
            "x": 8,
            "y": 34,
            "i": [
                "bytes",
                "strconv",
                "strings"
            ],
            "o": []
        },
        "encoding/base64": {
            "n": "encoding/base64",
            "x": 9,
            "y": 37,
            "i": [
                "io",
                "strconv"
            ],
            "o": [
                "encoding/json",
                "encoding/pem",
                "mime"
            ]
        },
        "encoding/binary": {
            "n": "encoding/binary",
            "x": 7,
            "y": 23,
            "i": [
                "io",
                "reflect"
            ],
            "o": [
                "archive/zip",
                "compress/gzip",
                "crypto/des",
                "debug/dwarf",
                "debug/gosym",
                "debug/plan9obj",
                "image/png",
                "index/suffixarray",
                "math/big"
            ]
        },
        "encoding/csv": {
            "n": "encoding/csv",
            "x": 9,
            "y": 28,
            "i": [
                "bufio",
                "fmt",
                "strings"
            ],
            "o": []
        },
        "encoding/gob": {
            "n": "encoding/gob",
            "x": 13,
            "y": 27,
            "i": [
                "bufio",
                "encoding",
                "fmt"
            ],
            "o": [
                "net/rpc"
            ]
        },
        "encoding/hex": {
            "n": "encoding/hex",
            "x": 10,
            "y": 45,
            "i": [
                "bytes",
                "fmt"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "encoding/json": {
            "n": "encoding/json",
            "x": 12,
            "y": 26,
            "i": [
                "bytes",
                "encoding",
                "encoding/base64",
                "fmt",
                "sort",
                "strings",
                "unicode/utf16"
            ],
            "o": [
                "expvar",
                "html/template"
            ]
        },
        "encoding/pem": {
            "n": "encoding/pem",
            "x": 10,
            "y": 28,
            "i": [
                "bytes",
                "encoding/base64",
                "sort",
                "strings"
            ],
            "o": [
                "crypto/x509"
            ]
        },
        "encoding/xml": {
            "n": "encoding/xml",
            "x": 12,
            "y": 34,
            "i": [
                "bufio",
                "encoding",
                "fmt",
                "strings"
            ],
            "o": []
        },
        "errors": {
            "n": "errors",
            "x": 3,
            "y": 26,
            "i": [],
            "o": [
                "io",
                "strconv",
                "syscall"
            ]
        },
        "expvar": {
            "n": "expvar",
            "x": 14,
            "y": 32,
            "i": [
                "encoding/json",
                "net/http"
            ],
            "o": []
        },
        "flag": {
            "n": "flag",
            "x": 13,
            "y": 21,
            "i": [
                "fmt",
                "sort"
            ],
            "o": [
                "net/http/httptest",
                "testing",
                "testing/quick"
            ]
        },
        "fmt": {
            "n": "fmt",
            "x": 7,
            "y": 25,
            "i": [
                "os",
                "reflect"
            ],
            "o": [
                "archive/tar",
                "compress/flate",
                "compress/lzw",
                "context",
                "database/sql/driver",
                "debug/dwarf",
                "debug/gosym",
                "debug/plan9obj",
                "encoding/csv",
                "encoding/gob",
                "encoding/hex",
                "encoding/json",
                "encoding/xml",
                "flag",
                "go/token",
                "log",
                "math/big",
                "mime",
                "mime/quotedprintable",
                "net/http/internal",
                "net/internal/socktest",
                "net/url",
                "os/user",
                "runtime/pprof",
                "text/scanner",
                "text/template/parse"
            ]
        },
        "go/ast": {
            "n": "go/ast",
            "x": 11,
            "y": 13,
            "i": [
                "go/scanner"
            ],
            "o": [
                "go/doc",
                "go/parser",
                "go/printer"
            ]
        },
        "go/build": {
            "n": "go/build",
            "x": 13,
            "y": 19,
            "i": [
                "bufio",
                "go/doc",
                "go/parser",
                "log"
            ],
            "o": [
                "go/internal/gcimporter"
            ]
        },
        "go/constant": {
            "n": "go/constant",
            "x": 12,
            "y": 8,
            "i": [
                "go/token",
                "math/big"
            ],
            "o": [
                "go/types"
            ]
        },
        "go/doc": {
            "n": "go/doc",
            "x": 12,
            "y": 21,
            "i": [
                "go/ast",
                "path",
                "regexp",
                "text/template"
            ],
            "o": [
                "go/build"
            ]
        },
        "go/format": {
            "n": "go/format",
            "x": 14,
            "y": 17,
            "i": [
                "go/parser",
                "go/printer"
            ],
            "o": []
        },
        "go/importer": {
            "n": "go/importer",
            "x": 15,
            "y": 22,
            "i": [
                "go/internal/gccgoimporter",
                "go/internal/gcimporter"
            ],
            "o": []
        },
        "go/internal/gccgoimporter": {
            "n": "go/internal/gccgoimporter",
            "x": 14,
            "y": 24,
            "i": [
                "debug/elf",
                "go/types",
                "os/exec",
                "text/scanner"
            ],
            "o": [
                "go/importer"
            ]
        },
        "go/internal/gcimporter": {
            "n": "go/internal/gcimporter",
            "x": 14,
            "y": 19,
            "i": [
                "go/build",
                "go/types",
                "text/scanner"
            ],
            "o": [
                "go/importer"
            ]
        },
        "go/parser": {
            "n": "go/parser",
            "x": 12,
            "y": 10,
            "i": [
                "go/ast",
                "io/ioutil"
            ],
            "o": [
                "go/build",
                "go/format",
                "go/types"
            ]
        },
        "go/printer": {
            "n": "go/printer",
            "x": 13,
            "y": 36,
            "i": [
                "go/ast",
                "text/tabwriter"
            ],
            "o": [
                "go/format"
            ]
        },
        "go/scanner": {
            "n": "go/scanner",
            "x": 10,
            "y": 13,
            "i": [
                "bytes",
                "go/token",
                "path/filepath"
            ],
            "o": [
                "go/ast"
            ]
        },
        "go/token": {
            "n": "go/token",
            "x": 9,
            "y": 19,
            "i": [
                "fmt",
                "sort"
            ],
            "o": [
                "go/constant",
                "go/scanner"
            ]
        },
        "go/types": {
            "n": "go/types",
            "x": 13,
            "y": 7,
            "i": [
                "container/heap",
                "go/constant",
                "go/parser"
            ],
            "o": [
                "go/internal/gccgoimporter",
                "go/internal/gcimporter"
            ]
        },
        "hash": {
            "n": "hash",
            "x": 7,
            "y": 35,
            "i": [
                "io"
            ],
            "o": [
                "crypto",
                "crypto/hmac",
                "hash/adler32",
                "hash/crc32",
                "hash/crc64",
                "hash/fnv"
            ]
        },
        "hash/adler32": {
            "n": "hash/adler32",
            "x": 11,
            "y": 47,
            "i": [
                "hash"
            ],
            "o": [
                "compress/zlib"
            ]
        },
        "hash/crc32": {
            "n": "hash/crc32",
            "x": 11,
            "y": 45,
            "i": [
                "hash"
            ],
            "o": [
                "archive/zip",
                "compress/gzip",
                "image/png"
            ]
        },
        "hash/crc64": {
            "n": "hash/crc64",
            "x": 8,
            "y": 42,
            "i": [
                "hash"
            ],
            "o": []
        },
        "hash/fnv": {
            "n": "hash/fnv",
            "x": 8,
            "y": 44,
            "i": [
                "hash"
            ],
            "o": []
        },
        "html": {
            "n": "html",
            "x": 12,
            "y": 50,
            "i": [
                "strings"
            ],
            "o": [
                "html/template"
            ]
        },
        "html/template": {
            "n": "html/template",
            "x": 13,
            "y": 40,
            "i": [
                "encoding/json",
                "html",
                "text/template"
            ],
            "o": [
                "net/http/pprof",
                "net/rpc"
            ]
        },
        "image": {
            "n": "image",
            "x": 12,
            "y": 38,
            "i": [
                "bufio",
                "image/color",
                "strconv"
            ],
            "o": [
                "image/internal/imageutil",
                "image/png"
            ]
        },
        "image/color": {
            "n": "image/color",
            "x": 11,
            "y": 49,
            "i": [],
            "o": [
                "image",
                "image/color/palette"
            ]
        },
        "image/color/palette": {
            "n": "image/color/palette",
            "x": 14,
            "y": 49,
            "i": [
                "image/color"
            ],
            "o": [
                "image/gif"
            ]
        },
        "image/draw": {
            "n": "image/draw",
            "x": 14,
            "y": 44,
            "i": [
                "image/internal/imageutil"
            ],
            "o": [
                "image/gif"
            ]
        },
        "image/gif": {
            "n": "image/gif",
            "x": 15,
            "y": 44,
            "i": [
                "compress/lzw",
                "image/color/palette",
                "image/draw"
            ],
            "o": []
        },
        "image/internal/imageutil": {
            "n": "image/internal/imageutil",
            "x": 13,
            "y": 44,
            "i": [
                "image"
            ],
            "o": [
                "image/draw",
                "image/jpeg"
            ]
        },
        "image/jpeg": {
            "n": "image/jpeg",
            "x": 14,
            "y": 46,
            "i": [
                "image/internal/imageutil"
            ],
            "o": []
        },
        "image/png": {
            "n": "image/png",
            "x": 13,
            "y": 38,
            "i": [
                "compress/zlib",
                "encoding/binary",
                "hash/crc32",
                "image"
            ],
            "o": []
        },
        "index/suffixarray": {
            "n": "index/suffixarray",
            "x": 12,
            "y": 6,
            "i": [
                "encoding/binary",
                "regexp"
            ],
            "o": []
        },
        "internal/nettrace": {
            "n": "internal/nettrace",
            "x": 9,
            "y": 9,
            "i": [],
            "o": [
                "net"
            ]
        },
        "internal/race": {
            "n": "internal/race",
            "x": 2,
            "y": 26,
            "i": [
                "unsafe"
            ],
            "o": [
                "sync"
            ]
        },
        "internal/singleflight": {
            "n": "internal/singleflight",
            "x": 9,
            "y": 11,
            "i": [
                "sync"
            ],
            "o": [
                "net"
            ]
        },
        "internal/syscall/windows/sysdll": {
            "n": "internal/syscall/windows/sysdll",
            "x": 0,
            "y": 25,
            "i": [],
            "o": []
        },
        "internal/testenv": {
            "n": "internal/testenv",
            "x": 15,
            "y": 24,
            "i": [
                "os/exec",
                "testing"
            ],
            "o": []
        },
        "internal/trace": {
            "n": "internal/trace",
            "x": 11,
            "y": 20,
            "i": [
                "bufio",
                "math/rand",
                "os/exec"
            ],
            "o": []
        },
        "io": {
            "n": "io",
            "x": 5,
            "y": 30,
            "i": [
                "errors",
                "sync"
            ],
            "o": [
                "bytes",
                "crypto/cipher",
                "encoding/ascii85",
                "encoding/base64",
                "encoding/binary",
                "hash",
                "os",
                "runtime/trace",
                "strings"
            ]
        },
        "io/ioutil": {
            "n": "io/ioutil",
            "x": 10,
            "y": 36,
            "i": [
                "bytes",
                "path/filepath",
                "strconv"
            ],
            "o": [
                "archive/tar",
                "archive/zip",
                "crypto/x509",
                "go/parser",
                "net/textproto",
                "text/template"
            ]
        },
        "log": {
            "n": "log",
            "x": 12,
            "y": 4,
            "i": [
                "fmt"
            ],
            "o": [
                "go/build",
                "log/syslog",
                "net/http",
                "net/mail",
                "testing/iotest"
            ]
        },
        "log/syslog": {
            "n": "log/syslog",
            "x": 13,
            "y": 17,
            "i": [
                "log",
                "net",
                "strings"
            ],
            "o": []
        },
        "math": {
            "n": "math",
            "x": 4,
            "y": 29,
            "i": [
                "unsafe"
            ],
            "o": [
                "math/cmplx",
                "math/rand",
                "strconv"
            ]
        },
        "math/big": {
            "n": "math/big",
            "x": 8,
            "y": 32,
            "i": [
                "bytes",
                "encoding/binary",
                "fmt",
                "math/rand",
                "strings"
            ],
            "o": [
                "crypto/dsa",
                "crypto/elliptic",
                "crypto/rand",
                "encoding/asn1",
                "go/constant"
            ]
        },
        "math/cmplx": {
            "n": "math/cmplx",
            "x": 5,
            "y": 32,
            "i": [
                "math"
            ],
            "o": []
        },
        "math/rand": {
            "n": "math/rand",
            "x": 7,
            "y": 33,
            "i": [
                "math",
                "sync"
            ],
            "o": [
                "internal/trace",
                "math/big",
                "net",
                "testing/quick"
            ]
        },
        "mime": {
            "n": "mime",
            "x": 11,
            "y": 28,
            "i": [
                "bufio",
                "encoding/base64",
                "fmt",
                "sort",
                "strings"
            ],
            "o": [
                "mime/multipart",
                "net/mail"
            ]
        },
        "mime/multipart": {
            "n": "mime/multipart",
            "x": 12,
            "y": 36,
            "i": [
                "crypto/rand",
                "mime",
                "mime/quotedprintable",
                "net/textproto"
            ],
            "o": [
                "net/http"
            ]
        },
        "mime/quotedprintable": {
            "n": "mime/quotedprintable",
            "x": 11,
            "y": 43,
            "i": [
                "bufio",
                "fmt"
            ],
            "o": [
                "mime/multipart"
            ]
        },
        "net": {
            "n": "net",
            "x": 10,
            "y": 16,
            "i": [
                "context",
                "internal/nettrace",
                "internal/singleflight",
                "math/rand",
                "sort"
            ],
            "o": [
                "crypto/x509",
                "log/syslog",
                "net/http/httptrace",
                "net/textproto"
            ]
        },
        "net/http": {
            "n": "net/http",
            "x": 13,
            "y": 25,
            "i": [
                "compress/gzip",
                "crypto/tls",
                "log",
                "mime/multipart",
                "net/http/httptrace",
                "net/http/internal",
                "net/url",
                "path"
            ],
            "o": [
                "expvar",
                "net/http/cgi",
                "net/http/cookiejar",
                "net/http/httptest",
                "net/http/httputil",
                "net/http/pprof",
                "net/rpc"
            ]
        },
        "net/http/cgi": {
            "n": "net/http/cgi",
            "x": 14,
            "y": 21,
            "i": [
                "net/http",
                "regexp"
            ],
            "o": [
                "net/http/fcgi"
            ]
        },
        "net/http/cookiejar": {
            "n": "net/http/cookiejar",
            "x": 14,
            "y": 37,
            "i": [
                "net/http"
            ],
            "o": []
        },
        "net/http/fcgi": {
            "n": "net/http/fcgi",
            "x": 15,
            "y": 20,
            "i": [
                "net/http/cgi"
            ],
            "o": []
        },
        "net/http/httptest": {
            "n": "net/http/httptest",
            "x": 14,
            "y": 15,
            "i": [
                "flag",
                "net/http"
            ],
            "o": []
        },
        "net/http/httptrace": {
            "n": "net/http/httptrace",
            "x": 12,
            "y": 0,
            "i": [
                "net"
            ],
            "o": [
                "net/http"
            ]
        },
        "net/http/httputil": {
            "n": "net/http/httputil",
            "x": 14,
            "y": 13,
            "i": [
                "net/http"
            ],
            "o": []
        },
        "net/http/internal": {
            "n": "net/http/internal",
            "x": 12,
            "y": 46,
            "i": [
                "bufio",
                "fmt"
            ],
            "o": [
                "net/http"
            ]
        },
        "net/http/pprof": {
            "n": "net/http/pprof",
            "x": 14,
            "y": 35,
            "i": [
                "html/template",
                "net/http",
                "runtime/pprof",
                "runtime/trace"
            ],
            "o": []
        },
        "net/internal/socktest": {
            "n": "net/internal/socktest",
            "x": 8,
            "y": 14,
            "i": [
                "fmt"
            ],
            "o": []
        },
        "net/mail": {
            "n": "net/mail",
            "x": 13,
            "y": 23,
            "i": [
                "log",
                "mime",
                "net/textproto"
            ],
            "o": []
        },
        "net/rpc": {
            "n": "net/rpc",
            "x": 14,
            "y": 30,
            "i": [
                "encoding/gob",
                "html/template",
                "net/http"
            ],
            "o": [
                "net/rpc/jsonrpc"
            ]
        },
        "net/rpc/jsonrpc": {
            "n": "net/rpc/jsonrpc",
            "x": 15,
            "y": 30,
            "i": [
                "net/rpc"
            ],
            "o": []
        },
        "net/smtp": {
            "n": "net/smtp",
            "x": 13,
            "y": 42,
            "i": [
                "crypto/tls",
                "net/textproto"
            ],
            "o": []
        },
        "net/textproto": {
            "n": "net/textproto",
            "x": 11,
            "y": 35,
            "i": [
                "bufio",
                "io/ioutil",
                "net"
            ],
            "o": [
                "mime/multipart",
                "net/mail",
                "net/smtp"
            ]
        },
        "net/url": {
            "n": "net/url",
            "x": 10,
            "y": 24,
            "i": [
                "bytes",
                "fmt",
                "sort",
                "strings"
            ],
            "o": [
                "net/http",
                "text/template"
            ]
        },
        "os": {
            "n": "os",
            "x": 6,
            "y": 27,
            "i": [
                "io",
                "time"
            ],
            "o": [
                "fmt",
                "os/signal",
                "path/filepath",
                "runtime/debug"
            ]
        },
        "os/exec": {
            "n": "os/exec",
            "x": 10,
            "y": 18,
            "i": [
                "bytes",
                "context",
                "path/filepath"
            ],
            "o": [
                "crypto/x509",
                "go/internal/gccgoimporter",
                "internal/testenv",
                "internal/trace"
            ]
        },
        "os/signal": {
            "n": "os/signal",
            "x": 7,
            "y": 19,
            "i": [
                "os"
            ],
            "o": []
        },
        "os/user": {
            "n": "os/user",
            "x": 8,
            "y": 38,
            "i": [
                "fmt",
                "strings"
            ],
            "o": []
        },
        "path": {
            "n": "path",
            "x": 11,
            "y": 15,
            "i": [
                "strings"
            ],
            "o": [
                "archive/tar",
                "archive/zip",
                "debug/dwarf",
                "go/doc",
                "net/http"
            ]
        },
        "path/filepath": {
            "n": "path/filepath",
            "x": 9,
            "y": 24,
            "i": [
                "os",
                "sort",
                "strings"
            ],
            "o": [
                "go/scanner",
                "io/ioutil",
                "os/exec"
            ]
        },
        "reflect": {
            "n": "reflect",
            "x": 6,
            "y": 24,
            "i": [
                "strconv",
                "sync"
            ],
            "o": [
                "encoding/binary",
                "fmt"
            ]
        },
        "regexp": {
            "n": "regexp",
            "x": 11,
            "y": 11,
            "i": [
                "regexp/syntax"
            ],
            "o": [
                "go/doc",
                "index/suffixarray",
                "net/http/cgi"
            ]
        },
        "regexp/syntax": {
            "n": "regexp/syntax",
            "x": 10,
            "y": 20,
            "i": [
                "bytes",
                "sort",
                "strconv",
                "strings"
            ],
            "o": [
                "regexp"
            ]
        },
        "runtime": {
            "n": "runtime",
            "x": 2,
            "y": 28,
            "i": [
                "runtime/internal/atomic",
                "runtime/internal/sys"
            ],
            "o": [
                "sync"
            ]
        },
        "runtime/cgo": {
            "n": "runtime/cgo",
            "x": 1,
            "y": 26,
            "i": [
                "unsafe"
            ],
            "o": []
        },
        "runtime/debug": {
            "n": "runtime/debug",
            "x": 13,
            "y": 15,
            "i": [
                "os",
                "sort"
            ],
            "o": [
                "testing"
            ]
        },
        "runtime/internal/atomic": {
            "n": "runtime/internal/atomic",
            "x": 1,
            "y": 28,
            "i": [
                "unsafe"
            ],
            "o": [
                "runtime"
            ]
        },
        "runtime/internal/sys": {
            "n": "runtime/internal/sys",
            "x": 1,
            "y": 30,
            "i": [],
            "o": [
                "runtime"
            ]
        },
        "runtime/pprof": {
            "n": "runtime/pprof",
            "x": 13,
            "y": 30,
            "i": [
                "bufio",
                "fmt",
                "sort",
                "strings",
                "text/tabwriter"
            ],
            "o": [
                "net/http/pprof",
                "testing"
            ]
        },
        "runtime/race": {
            "n": "runtime/race",
            "x": 0,
            "y": 31,
            "i": [],
            "o": []
        },
        "runtime/trace": {
            "n": "runtime/trace",
            "x": 13,
            "y": 46,
            "i": [
                "io"
            ],
            "o": [
                "net/http/pprof",
                "testing"
            ]
        },
        "sort": {
            "n": "sort",
            "x": 8,
            "y": 12,
            "i": [],
            "o": [
                "compress/bzip2",
                "compress/flate",
                "container/heap",
                "database/sql",
                "debug/dwarf",
                "encoding/json",
                "encoding/pem",
                "flag",
                "go/token",
                "mime",
                "net",
                "net/url",
                "path/filepath",
                "regexp/syntax",
                "runtime/debug",
                "runtime/pprof"
            ]
        },
        "strconv": {
            "n": "strconv",
            "x": 5,
            "y": 26,
            "i": [
                "errors",
                "math",
                "unicode/utf8"
            ],
            "o": [
                "crypto",
                "crypto/aes",
                "crypto/rc4",
                "encoding/ascii85",
                "encoding/base32",
                "encoding/base64",
                "image",
                "io/ioutil",
                "reflect",
                "regexp/syntax"
            ]
        },
        "strings": {
            "n": "strings",
            "x": 7,
            "y": 29,
            "i": [
                "io",
                "unicode",
                "unicode/utf8"
            ],
            "o": [
                "debug/gosym",
                "encoding/base32",
                "encoding/csv",
                "encoding/json",
                "encoding/pem",
                "encoding/xml",
                "html",
                "log/syslog",
                "math/big",
                "mime",
                "net/url",
                "os/user",
                "path",
                "path/filepath",
                "regexp/syntax",
                "runtime/pprof",
                "testing/quick",
                "text/template/parse"
            ]
        },
        "sync": {
            "n": "sync",
            "x": 3,
            "y": 28,
            "i": [
                "internal/race",
                "runtime",
                "sync/atomic"
            ],
            "o": [
                "internal/singleflight",
                "io",
                "math/rand",
                "reflect",
                "syscall"
            ]
        },
        "sync/atomic": {
            "n": "sync/atomic",
            "x": 2,
            "y": 30,
            "i": [
                "unsafe"
            ],
            "o": [
                "sync"
            ]
        },
        "syscall": {
            "n": "syscall",
            "x": 4,
            "y": 27,
            "i": [
                "errors",
                "sync"
            ],
            "o": [
                "time"
            ]
        },
        "testing": {
            "n": "testing",
            "x": 14,
            "y": 28,
            "i": [
                "flag",
                "runtime/debug",
                "runtime/pprof",
                "runtime/trace"
            ],
            "o": [
                "internal/testenv"
            ]
        },
        "testing/iotest": {
            "n": "testing/iotest",
            "x": 13,
            "y": 5,
            "i": [
                "log"
            ],
            "o": []
        },
        "testing/quick": {
            "n": "testing/quick",
            "x": 14,
            "y": 26,
            "i": [
                "flag",
                "math/rand",
                "strings"
            ],
            "o": []
        },
        "text/scanner": {
            "n": "text/scanner",
            "x": 13,
            "y": 32,
            "i": [
                "bytes",
                "fmt"
            ],
            "o": [
                "go/internal/gccgoimporter",
                "go/internal/gcimporter"
            ]
        },
        "text/tabwriter": {
            "n": "text/tabwriter",
            "x": 12,
            "y": 48,
            "i": [
                "bytes"
            ],
            "o": [
                "go/printer",
                "runtime/pprof"
            ]
        },
        "text/template": {
            "n": "text/template",
            "x": 11,
            "y": 41,
            "i": [
                "io/ioutil",
                "net/url",
                "text/template/parse"
            ],
            "o": [
                "go/doc",
                "html/template"
            ]
        },
        "text/template/parse": {
            "n": "text/template/parse",
            "x": 10,
            "y": 41,
            "i": [
                "bytes",
                "fmt",
                "strings"
            ],
            "o": [
                "text/template"
            ]
        },
        "time": {
            "n": "time",
            "x": 5,
            "y": 24,
            "i": [
                "syscall"
            ],
            "o": [
                "os"
            ]
        },
        "unicode": {
            "n": "unicode",
            "x": 6,
            "y": 33,
            "i": [],
            "o": [
                "bytes",
                "strings"
            ]
        },
        "unicode/utf16": {
            "n": "unicode/utf16",
            "x": 11,
            "y": 51,
            "i": [],
            "o": [
                "encoding/json"
            ]
        },
        "unicode/utf8": {
            "n": "unicode/utf8",
            "x": 4,
            "y": 25,
            "i": [],
            "o": [
                "bytes",
                "strconv",
                "strings"
            ]
        },
        "unsafe": {
            "n": "unsafe",
            "x": 0,
            "y": 27,
            "i": [],
            "o": [
                "internal/race",
                "math",
                "runtime/cgo",
                "runtime/internal/atomic",
                "sync/atomic"
            ]
        }
    }
};
